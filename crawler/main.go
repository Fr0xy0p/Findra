package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

func main() {
	seedsFlag := flag.String("seeds", "https://en.wikipedia.org/wiki/Search_engine", "Comma-separated seed URLs or file path")
	maxPages := flag.Int("max-pages", 30, "Maximum total pages to crawl")
	concurrency := flag.Int("concurrency", 6, "Number of concurrent worker goroutines")
	delayMs := flag.Int("delay-ms", 300, "Politeness delay per domain in milliseconds")
	maxDepth := flag.Int("max-depth", 3, "Maximum BFS crawl depth")
	allowedDomainsFlag := flag.String("allowed-domains", "", "Comma-separated domain whitelist (leave empty for open crawl)")
	outputPath := flag.String("output", "data/raw_crawled/crawl_output.jsonl", "Path to save crawled JSONL output")
	userAgent := flag.String("user-agent", "NexusSearchCrawler/1.0 (+https://github.com/google/search-engine; polite)", "Crawler User-Agent")

	flag.Parse()

	// Parse seeds
	var seeds []string
	if strings.HasSuffix(*seedsFlag, ".txt") {
		content, err := os.ReadFile(*seedsFlag)
		if err == nil {
			for _, line := range strings.Split(string(content), "\n") {
				line = strings.TrimSpace(line)
				if line != "" && !strings.HasPrefix(line, "#") {
					seeds = append(seeds, line)
				}
			}
		}
	} else {
		for _, s := range strings.Split(*seedsFlag, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				seeds = append(seeds, s)
			}
		}
	}

	var allowedDomains []string
	if *allowedDomainsFlag != "" {
		allowedDomains = strings.Split(*allowedDomainsFlag, ",")
	}

	// Ensure output directory exists
	if err := os.MkdirAll(filepath.Dir(*outputPath), 0755); err != nil {
		fmt.Printf("[-] Failed to create output directory: %v\n", err)
		os.Exit(1)
	}

	outFile, err := os.OpenFile(*outputPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		fmt.Printf("[-] Failed to open output file: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	fmt.Println("==================================================")
	fmt.Println("🚀 NEXUS DISTRIBUTED POLITE WEB CRAWLER (Go)")
	fmt.Printf("   Workers: %d | Politeness Delay: %dms | Max Pages: %d\n", *concurrency, *delayMs, *maxPages)
	fmt.Printf("   Seeds: %v\n", seeds)
	fmt.Printf("   Output: %s\n", *outputPath)
	fmt.Println("==================================================")

	frontier := NewURLFrontier(*maxDepth, allowedDomains)
	for _, s := range seeds {
		frontier.Push(s, 0)
	}

	fetcher := NewPoliteFetcher(*userAgent, 10*time.Second, time.Duration(*delayMs)*time.Millisecond)

	var crawledCount int64
	var writeMu sync.Mutex
	var wg sync.WaitGroup

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	doneChan := make(chan struct{})

	// Worker goroutines
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for {
				select {
				case <-doneChan:
					return
				default:
					if atomic.LoadInt64(&crawledCount) >= int64(*maxPages) {
						return
					}

					item, ok := frontier.Pop()
					if !ok {
						// Wait briefly for new discovered URLs
						time.Sleep(100 * time.Millisecond)
						qSize, _ := frontier.Size()
						if qSize == 0 && atomic.LoadInt64(&crawledCount) > 0 {
							// Check again after short pause
							time.Sleep(300 * time.Millisecond)
							if qSize, _ = frontier.Size(); qSize == 0 {
								return
							}
						}
						continue
					}

					res, err := fetcher.Fetch(item.URL, item.Depth)
					if err != nil {
						fmt.Printf("[Worker %d] ⚠️ Skip %s: %v\n", workerID, item.URL, err)
						continue
					}

					// Enqueue newly discovered links
					newLinksCount := 0
					for _, link := range res.Links {
						if frontier.Push(link, item.Depth+1) {
							newLinksCount++
						}
					}

					// Write to storage
					jsonBytes, err := json.Marshal(res)
					if err == nil {
						writeMu.Lock()
						_, _ = outFile.Write(append(jsonBytes, '\n'))
						writeMu.Unlock()
					}

					count := atomic.AddInt64(&crawledCount, 1)
					fmt.Printf("[Worker %d] ✓ [%d/%d] Fetched: %s (+%d links, %d bytes)\n",
						workerID, count, *maxPages, item.URL, newLinksCount, len(res.HTML))

					if count >= int64(*maxPages) {
						return
					}
				}
			}
		}(i)
	}

	// Wait in background or handle termination
	go func() {
		<-stopChan
		fmt.Println("\n[*] Graceful shutdown requested... finishing current requests.")
		close(doneChan)
	}()

	wg.Wait()
	fmt.Printf("\n[✓] Crawl finished! Total pages successfully acquired: %d\n", atomic.LoadInt64(&crawledCount))
}

