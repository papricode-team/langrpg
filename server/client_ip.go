package main

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// parseTrustedProxies reads TRUSTED_PROXIES: comma-separated CIDRs or single
// addresses of the reverse proxies allowed to report a client address. Like
// ADMIN_EMAILS, one invalid entry rejects the whole list. Empty trusts nothing.
func parseTrustedProxies(value string) ([]netip.Prefix, error) {
	var prefixes []netip.Prefix
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if prefix, err := netip.ParsePrefix(entry); err == nil {
			prefixes = append(prefixes, prefix.Masked())
			continue
		}
		address, err := netip.ParseAddr(entry)
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES must be a comma-separated list of CIDRs or IP addresses (invalid %q)", entry)
		}
		address = address.Unmap()
		prefixes = append(prefixes, netip.PrefixFrom(address, address.BitLen()))
	}
	return prefixes, nil
}

func (a *App) trustedProxy(address netip.Addr) bool {
	address = address.Unmap()
	for _, prefix := range a.trustedProxies {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}

func parseForwardedAddr(value string) (netip.Addr, bool) {
	value = strings.TrimSpace(value)
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	address, err := netip.ParseAddr(strings.Trim(value, "[]"))
	if err != nil {
		return netip.Addr{}, false
	}
	return address.Unmap(), true
}

// clientIP is the address used to key per-client rate limits. Forwarding
// headers are honoured only when the direct peer is a configured proxy, so a
// client connecting directly cannot choose its own limiter key. Within
// X-Forwarded-For, the rightmost address that is not a trusted proxy is the
// first hop a trusted proxy actually observed; anything left of it is
// client-supplied.
func (a *App) clientIP(r *http.Request) string {
	remote := r.RemoteAddr
	if host, _, err := net.SplitHostPort(remote); err == nil {
		remote = host
	}
	peer, err := netip.ParseAddr(remote)
	if err != nil || !a.trustedProxy(peer) {
		return remote
	}
	if values := r.Header.Values("X-Forwarded-For"); len(values) > 0 {
		hops := strings.Split(strings.Join(values, ","), ",")
		var leftmost netip.Addr
		for i := len(hops) - 1; i >= 0; i-- {
			address, ok := parseForwardedAddr(hops[i])
			if !ok {
				// A malformed hop cannot be attributed; stop at the last proxy.
				break
			}
			if !a.trustedProxy(address) {
				return address.String()
			}
			leftmost = address
		}
		if leftmost.IsValid() {
			return leftmost.String()
		}
		return peer.Unmap().String()
	}
	if address, ok := parseForwardedAddr(r.Header.Get("X-Real-IP")); ok {
		return address.String()
	}
	return peer.Unmap().String()
}
