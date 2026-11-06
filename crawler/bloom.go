package main

import (
	"hash/fnv"
	"math"
	"sync"
)

// BloomFilter provides memory-efficient, probabilistic set membership testing.
// Guaranteed zero false negatives: if Test() returns false, the item was definitely not added.
type BloomFilter struct {
	mu       sync.RWMutex
	bitset   []uint64
	size     uint64
	hashFuncs uint32
}

func NewBloomFilter(expectedElements uint64, falsePositiveRate float64) *BloomFilter {
	if expectedElements == 0 {
		expectedElements = 100000
	}
	if falsePositiveRate <= 0 || falsePositiveRate >= 1 {
		falsePositiveRate = 0.01 // 1% default error rate
	}

	// Optimal bit array size m = - (n * ln(p)) / (ln(2)^2)
	m := uint64(math.Ceil(-float64(expectedElements) * math.Log(falsePositiveRate) / (math.Ln2 * math.Ln2)))
	// Optimal number of hash functions k = (m / n) * ln(2)
	k := uint32(math.Ceil((float64(m) / float64(expectedElements)) * math.Ln2))
	if k < 1 {
		k = 1
	}

	// Number of 64-bit words needed
	words := (m + 63) / 64

	return &BloomFilter{
		bitset:    make([]uint64, words),
		size:      m,
		hashFuncs: k,
	}
}

// computeHashes generates k distinct hash values using double hashing (Kirsch-Mitzenmacher technique)
func (bf *BloomFilter) computeHashes(data string) (uint64, uint64) {
	h := fnv.New64a()
	_, _ = h.Write([]byte(data))
	h1 := h.Sum64()

	// Secondary hash using alternate offset
	h2 := h1>>32 | h1<<32
	h2 = h2*0x517cc1b727220a95 + 0x01
	return h1, h2
}

func (bf *BloomFilter) Add(item string) {
	h1, h2 := bf.computeHashes(item)
	bf.mu.Lock()
	defer bf.mu.Unlock()

	for i := uint32(0); i < bf.hashFuncs; i++ {
		combined := (h1 + uint64(i)*h2) % bf.size
		wordIdx := combined / 64
		bitIdx := combined % 64
		bf.bitset[wordIdx] |= (1 << bitIdx)
	}
}

func (bf *BloomFilter) Contains(item string) bool {
	h1, h2 := bf.computeHashes(item)
	bf.mu.RLock()
	defer bf.mu.RUnlock()

	for i := uint32(0); i < bf.hashFuncs; i++ {
		combined := (h1 + uint64(i)*h2) % bf.size
		wordIdx := combined / 64
		bitIdx := combined % 64
		if (bf.bitset[wordIdx] & (1 << bitIdx)) == 0 {
			return false
		}
	}
	return true
}

