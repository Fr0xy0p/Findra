package main

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

type PipelineManager struct {
	mu        sync.Mutex
	isRunning bool
}

var globalPipeline = &PipelineManager{}

func (pm *PipelineManager) TriggerCrawl(seeds []string, maxPages int, delayMs int) error {
	pm.mu.Lock()
	if pm.isRunning {
		pm.mu.Unlock()
		return fmt.Errorf("crawl pipeline is already currently running")
	}
	pm.isRunning = true
	pm.mu.Unlock()

	defer func() {
		pm.mu.Lock()
		pm.isRunning = false
		pm.mu.Unlock()
	}()

	seedsArg := strings.Join(seeds, ",")

	// 1. Run Go Crawler
	fmt.Printf("[Pipeline] 🚀 Running Go Crawler for %d pages...\n", maxPages)
	crawlerCmd := exec.Command("./crawler/crawler_bin",
		"--seeds", seedsArg,
		"--max-pages", fmt.Sprintf("%d", maxPages),
		"--delay-ms", fmt.Sprintf("%d", delayMs),
		"--output", "data/raw_crawled/crawl_output.jsonl",
	)
	if out, err := crawlerCmd.CombinedOutput(); err != nil {
		fmt.Printf("[Pipeline] Crawler output: %s\n", string(out))
		return fmt.Errorf("crawler failed: %w", err)
	}

	// 2. Run Python Extractor & NLP Text Processor
	fmt.Println("[Pipeline] 🐍 Running Python HTML Parser & Porter Stemmer...")
	pyCmd := exec.Command(".venv/bin/python3", "extractor/run_pipeline.py",
		"--input", "data/raw_crawled/crawl_output.jsonl",
		"--output", "data/parsed",
	)
	if out, err := pyCmd.CombinedOutput(); err != nil {
		fmt.Printf("[Pipeline] Extractor output: %s\n", string(out))
		return fmt.Errorf("extractor failed: %w", err)
	}

	// 3. Run C++ PageRank Engine
	fmt.Println("[Pipeline] ⚡ Running C++ PageRank Power Iteration Engine...")
	prCmd := exec.Command("./pagerank/pagerank_engine",
		"data/parsed/link_graph.json",
		"data/parsed/pagerank_scores.json",
	)
	if out, err := prCmd.CombinedOutput(); err != nil {
		fmt.Printf("[Pipeline] PageRank output: %s\n", string(out))
		return fmt.Errorf("pagerank engine failed: %w", err)
	}

	fmt.Println("[Pipeline] [✓] Pipeline execution finished successfully!")
	return nil
}

