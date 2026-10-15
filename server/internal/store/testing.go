package store

import "time"

// Test support: HTTP-level tests in the server package seed legacy saved
// state and simulate persistence failures with these. Production code does
// not call them.

// Path is the JSON store's state file ("" for an in-memory store).
func (s *JSONStore) Path() string { return s.path }

// EditStateForTest runs fn on the saved document under the store lock. The
// change is kept in memory and written with the next save.
func (s *JSONStore) EditStateForTest(fn func(*DiskState)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(&s.state)
}

// SetPathForTest redirects later saves, for example to an unwritable path.
func (s *JSONStore) SetPathForTest(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.path = path
}

// SetClockForTest replaces the clock used for session idle expiry.
func (p *sessionIdlePolicy) SetClockForTest(clock func() time.Time) { p.clock = clock }
