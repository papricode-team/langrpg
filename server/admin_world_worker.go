package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
)

// WorldProblem mirrors WorldProblem in web/src/world-edit-rules.ts. Messages are
// complete sentences that name objects; objectIds tell editors what to highlight.
type WorldProblem struct {
	Code      string    `json:"code"`
	Message   string    `json:"message"`
	Map       string    `json:"map"`
	ObjectIDs []string  `json:"objectIds"`
	Point     *MapSpawn `json:"point,omitempty"`
	Severity  string    `json:"severity"`
}

// WorldProblemError is returned to editors as {error, problems}.
type WorldProblemError struct {
	Status   int
	Problems []WorldProblem
}

func (e *WorldProblemError) Error() string {
	if len(e.Problems) == 0 {
		return "the world edit was refused"
	}
	return e.Problems[0].Message
}

func worldProblems(status int, code, message string, ids ...string) *WorldProblemError {
	if ids == nil {
		ids = []string{}
	}
	return &WorldProblemError{status, []WorldProblem{{Code: code, Message: message, ObjectIDs: ids, Severity: "error"}}}
}

// worldWorker keeps one Node process that holds the published document and its
// navigation grids, so single edits are checked without a full compile.
type worldWorker struct {
	mu      sync.Mutex
	script  string
	root    string
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	lines   chan []byte
	next    int
	baseKey string
	// The revision whose document the worker holds under baseKey.
	baseRevision string
	warming      bool
}

type workerResponse struct {
	ID           int             `json:"id"`
	OK           bool            `json:"ok"`
	NeedDocument bool            `json:"needDocument"`
	Key          string          `json:"key"`
	Applied      json.RawMessage `json:"applied"`
	Warnings     []WorldProblem  `json:"warnings"`
	Problems     []WorldProblem  `json:"problems"`
	Bundle       *WorldContent   `json:"bundle"`
}

func newWorldWorker(script, root string) *worldWorker {
	return &worldWorker{script: script, root: root}
}

func (w *worldWorker) startLocked() error {
	if w.cmd != nil {
		return nil
	}
	cmd := exec.Command("node", w.script, "--root", w.root)
	cmd.Stderr = os.Stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return &APIError{503, "the world editor is unavailable on this server"}
		}
		return err
	}
	lines := make(chan []byte, 4)
	go func() {
		defer close(lines)
		reader := bufio.NewReaderSize(stdout, 1<<20)
		for {
			line, err := reader.ReadBytes('\n')
			if len(strings.TrimSpace(string(line))) > 0 {
				lines <- line
			}
			if err != nil {
				return
			}
		}
	}()
	w.cmd, w.stdin, w.lines = cmd, stdin, lines
	w.baseKey, w.baseRevision = "", ""
	// The first line announces readiness.
	if _, ok := <-lines; !ok {
		w.stopLocked()
		return errors.New("world edit worker exited during startup")
	}
	return nil
}

func (w *worldWorker) stopLocked() {
	if w.cmd == nil {
		return
	}
	_ = w.stdin.Close()
	if w.cmd.Process != nil {
		_ = w.cmd.Process.Kill()
	}
	_ = w.cmd.Wait()
	w.cmd, w.stdin, w.lines = nil, nil, nil
	w.baseKey, w.baseRevision = "", ""
}

func (w *worldWorker) stop() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.stopLocked()
}

func (w *worldWorker) callLocked(ctx context.Context, request map[string]any) (*workerResponse, error) {
	if err := w.startLocked(); err != nil {
		return nil, err
	}
	w.next++
	request["id"] = w.next
	data, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	if _, err := w.stdin.Write(append(data, '\n')); err != nil {
		w.stopLocked()
		return nil, fmt.Errorf("world edit worker write: %w", err)
	}
	for {
		select {
		case <-ctx.Done():
			// The worker may still be busy with this request; replace it.
			w.stopLocked()
			return nil, &APIError{503, "checking the edit took too long; try again"}
		case line, ok := <-w.lines:
			if !ok {
				w.stopLocked()
				return nil, errors.New("world edit worker exited")
			}
			var response workerResponse
			if err := json.Unmarshal(line, &response); err != nil {
				w.stopLocked()
				return nil, fmt.Errorf("decode world edit worker response: %w", err)
			}
			if response.ID != w.next {
				continue
			}
			return &response, nil
		}
	}
}

// apply checks and applies edit operations on top of the current publication.
func (w *worldWorker) apply(ctx context.Context, current *WorldContent, ops json.RawMessage) (*workerResponse, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for attempt := 0; attempt < 2; attempt++ {
		base := map[string]any{"key": w.baseKey}
		if w.cmd == nil || w.baseRevision != current.Revision || attempt > 0 {
			base = map[string]any{"key": current.Revision, "document": current.Document}
		}
		response, err := w.callLocked(ctx, map[string]any{"type": "apply", "base": base, "ops": ops})
		if err != nil {
			return nil, err
		}
		if _, sent := base["document"]; sent {
			w.baseKey, w.baseRevision = current.Revision, current.Revision
		}
		if response.NeedDocument {
			continue
		}
		return response, nil
	}
	return nil, errors.New("world edit worker could not load the world")
}

// committed records that the worker's latest state is now the publication.
func (w *worldWorker) committed(key, revision string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cmd != nil && key != "" {
		w.baseKey, w.baseRevision = key, revision
	}
}

// warmSoon starts the worker and builds navigation grids in the background
// when an admin opens an editor, so the first edit is quick.
func (w *worldWorker) warmSoon(current *WorldContent) {
	w.mu.Lock()
	ready := w.cmd != nil || w.warming
	w.warming = true
	w.mu.Unlock()
	if !ready {
		go func() {
			w.warm(current)
			w.mu.Lock()
			w.warming = false
			w.mu.Unlock()
		}()
	}
}

// warm builds navigation grids before the first edit arrives.
func (w *worldWorker) warm(current *WorldContent) {
	w.mu.Lock()
	defer w.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), maxWorkerWait)
	defer cancel()
	_, err := w.callLocked(ctx, map[string]any{"type": "warm", "base": map[string]any{"key": current.Revision, "document": current.Document}})
	if err != nil {
		slog.Warn("world edit worker warm-up failed", "error", err)
		return
	}
	w.baseKey, w.baseRevision = current.Revision, current.Revision
}

// reconcile adds story anchors from the seed to document and recompiles its
// authority. It does not change the document the worker holds for edits.
func (w *worldWorker) reconcile(ctx context.Context, document, seed json.RawMessage) (*WorldContent, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	request := map[string]any{"type": "reconcile", "document": document}
	if seed != nil {
		request["seed"] = seed
	}
	response, err := w.callLocked(ctx, request)
	if err != nil {
		return nil, err
	}
	if !response.OK || response.Bundle == nil {
		return nil, &WorldProblemError{422, response.Problems}
	}
	return response.Bundle, nil
}
