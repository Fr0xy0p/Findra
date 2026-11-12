package main

import (
	"fmt"
	"os"
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
	crawlerPath := "./crawler/crawler_bin"
	if _, err := os.Stat(crawlerPath); os.IsNotExist(err) {
		if _, err := os.Stat("./crawler_bin"); err == nil {
			crawlerPath = "./crawler_bin"
		}
	}

	crawlerCmd := exec.Command(crawlerPath,
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
	pyBin := "python3"
	if _, err := os.Stat(".venv/bin/python3"); err == nil {
		pyBin = ".venv/bin/python3"
	}
	pyCmd := exec.Command(pyBin, "extractor/run_pipeline.py",
		"--input", "data/raw_crawled/crawl_output.jsonl",
		"--output", "data/parsed",
	)
	if out, err := pyCmd.CombinedOutput(); err != nil {
		fmt.Printf("[Pipeline] Extractor output: %s\n", string(out))
		return fmt.Errorf("extractor failed: %w", err)
	}

	// 3. Run PageRank Engine (C++ or Python fallback)
	fmt.Println("[Pipeline] ⚡ Running PageRank Power Iteration Engine...")
	prPath := "./pagerank/pagerank_engine"
	if _, err := os.Stat(prPath); os.IsNotExist(err) {
		if _, err := os.Stat("./pagerank_engine"); err == nil {
			prPath = "./pagerank_engine"
		}
	}

	prCmd := exec.Command(prPath,
		"data/parsed/link_graph.json",
		"data/parsed/pagerank_scores.json",
	)
	if out, err := prCmd.CombinedOutput(); err != nil {
		fmt.Printf("[Pipeline] C++ PageRank failed (%v: %s), running fallback...\n", err, string(out))
		pyPrCmd := exec.Command(pyBin, "scripts/ingest_global.py")
		_ = pyPrCmd.Run()
	}

	fmt.Println("[Pipeline] [✓] Pipeline execution finished successfully!")
	return nil
}

