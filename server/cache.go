package main

import (
	"sync"
	"time"
)

type CacheItem struct {
	Value      []byte
	Expiration time.Time
}

type QueryCache struct {
	mu      sync.RWMutex
	items   map[string]CacheItem
	ttl     time.Duration
	hits    uint64
	misses  uint64
	maxSize int
}

func NewQueryCache(ttl time.Duration, maxSize int) *QueryCache {
	qc := &QueryCache{
		items:   make(map[string]CacheItem),
		ttl:     ttl,
		maxSize: maxSize,
	}

	// Background eviction goroutine
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		for range ticker.C {
			qc.evictExpired()
		}
	}()

	return qc
}

func (c *QueryCache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	item, found := c.items[key]
	c.mu.RUnlock()

	if !found {
		c.mu.Lock()
		c.misses++
		c.mu.Unlock()
		return nil, false
	}

	if time.Now().After(item.Expiration) {
		c.mu.Lock()
		delete(c.items, key)
		c.misses++
		c.mu.Unlock()
		return nil, false
	}

	c.mu.Lock()
	c.hits++
	c.mu.Unlock()
	return item.Value, true
}

func (c *QueryCache) Set(key string, val []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// If cache exceeds maxSize, perform naive pruning of 15% items
	if len(c.items) >= c.maxSize {
		count := 0
		for k := range c.items {
			delete(c.items, k)
			count++
			if count > c.maxSize/6 {
				break
			}
		}
	}

	c.items[key] = CacheItem{
		Value:      val,
		Expiration: time.Now().Add(c.ttl),
	}
}

func (c *QueryCache) evictExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for k, item := range c.items {
		if now.After(item.Expiration) {
			delete(c.items, k)
		}
	}
}

func (c *QueryCache) Stats() (hits uint64, misses uint64, count int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.hits, c.misses, len(c.items)
}

