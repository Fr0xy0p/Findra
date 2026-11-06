package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type InstantAnswer struct {
	Type        string `json:"type"`                   // "ai_overview", "calculator", "converter", "definition", "fact"
	Title       string `json:"title"`                  // Direct bold answer
	Subtitle    string `json:"subtitle,omitempty"`     // Contextual subtitle
	Description string `json:"description,omitempty"`  // In-depth synthesis
	Badge       string `json:"badge"`                  // "AI Overview", "Calculator", etc.
	SourceURL   string `json:"source_url,omitempty"`   // URL of verified source
	SourceTitle string `json:"source_title,omitempty"` // Title of verified source
}

var (
	mathSimpleRegex  = regexp.MustCompile(`^\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/xX\^])\s*(-?\d+(?:\.\d+)?)\s*$`)
	sqrtRegex        = regexp.MustCompile(`(?i)^\s*sqrt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*$`)
	percentOfRegex   = regexp.MustCompile(`(?i)^\s*(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\s*$`)
	unitConvertRegex = regexp.MustCompile(`(?i)^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+(?:in|to)\s+([a-zA-Z]+)\s*$`)

	wikiClient = &http.Client{
		Timeout: 1500 * time.Millisecond,
		Transport: &http.Transport{
			MaxIdleConns:        20,
			IdleConnTimeout:     30 * time.Second,
			DisableCompression: false,
		},
	}

	wikiCache   = sync.Map{} // cache for dynamic wiki lookups
	punctRegexp = regexp.MustCompile(`[?!,."';:()]`)
	spaceReg    = regexp.MustCompile(`\s+`)
)

// normalizeQuestion strips punctuation, trims spaces, and fixes common typos
func normalizeQuestion(q string) string {
	s := strings.ToLower(strings.TrimSpace(q))
	s = punctRegexp.ReplaceAllString(s, " ")
	s = spaceReg.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)

	words := strings.Fields(s)
	for i, w := range words {
		switch w {
		case "ia": // user typo: "who ia the prime minister of india"
			words[i] = "is"
		case "whos":
			words[i] = "who is"
		case "whats":
			words[i] = "what is"
		case "primeminister":
			words[i] = "prime minister"
		case "presedent":
			words[i] = "president"
		case "captial":
			words[i] = "capital"
		case "curency":
			words[i] = "currency"
		}
	}
	return strings.Join(words, " ")
}

// IsQuestionQuery checks if the query exhibits question intent
func IsQuestionQuery(q string) bool {
	qLower := strings.ToLower(strings.TrimSpace(q))
	if strings.HasSuffix(qLower, "?") {
		return true
	}
	prefixes := []string{
		"who is", "who was", "who are", "who were", "who ia", "whos",
		"what is", "what was", "what are", "what were", "whats", "what does",
		"where is", "where was", "where are",
		"when was", "when did", "when is",
		"why is", "why do", "why does",
		"how many", "how much", "how tall", "how deep", "how far", "how old",
		"prime minister of", "president of", "capital of", "currency of",
		"founder of", "ceo of", "speed of",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(qLower, p) {
			return true
		}
	}
	return false
}

// ResolveInstantAnswer evaluates queries for Math, Unit Conversions, Curated Knowledge Graph, and Dynamic AI Overview
func ResolveInstantAnswer(query string) *InstantAnswer {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil
	}
	norm := normalizeQuestion(q)

	// 1. Math: Percentage of number (e.g. "15% of 800")
	if m := percentOfRegex.FindStringSubmatch(q); len(m) == 3 {
		pct, _ := strconv.ParseFloat(m[1], 64)
		base, _ := strconv.ParseFloat(m[2], 64)
		result := (pct / 100.0) * base
		return &InstantAnswer{
			Type:        "calculator",
			Title:       fmt.Sprintf("%g%% of %g = %g", pct, base, result),
			Subtitle:    "Percentage Calculation",
			Description: fmt.Sprintf("(%g ÷ 100) × %g = %g", pct, base, result),
			Badge:       "Calculator",
		}
	}

	// 2. Math: Sqrt (e.g. "sqrt(144)")
	if m := sqrtRegex.FindStringSubmatch(q); len(m) == 2 {
		val, _ := strconv.ParseFloat(m[1], 64)
		if val >= 0 {
			res := math.Sqrt(val)
			return &InstantAnswer{
				Type:        "calculator",
				Title:       fmt.Sprintf("√%g = %g", val, res),
				Subtitle:    "Square Root",
				Description: fmt.Sprintf("The principal square root of %g is %g", val, res),
				Badge:       "Calculator",
			}
		}
	}

	// 3. Math: Simple 2-operand arithmetic (e.g. "25 * 4", "100 / 4", "2^8")
	if m := mathSimpleRegex.FindStringSubmatch(q); len(m) == 4 {
		v1, err1 := strconv.ParseFloat(m[1], 64)
		op := m[2]
		v2, err2 := strconv.ParseFloat(m[3], 64)

		if err1 == nil && err2 == nil {
			var result float64
			var opSymbol string
			valid := true

			switch op {
			case "+":
				result = v1 + v2
				opSymbol = "+"
			case "-":
				result = v1 - v2
				opSymbol = "-"
			case "*", "x", "X":
				result = v1 * v2
				opSymbol = "×"
			case "/":
				if v2 == 0 {
					return &InstantAnswer{
						Type:     "calculator",
						Title:    "Cannot divide by zero",
						Subtitle: "Arithmetic Error",
						Badge:    "Calculator",
					}
				}
				result = v1 / v2
				opSymbol = "÷"
			case "^":
				result = math.Pow(v1, v2)
				opSymbol = "^"
			default:
				valid = false
			}

			if valid {
				return &InstantAnswer{
					Type:     "calculator",
					Title:    fmt.Sprintf("%g %s %g = %g", v1, opSymbol, v2, result),
					Subtitle: "Calculation",
					Badge:    "Calculator",
				}
			}
		}
	}

	// 4. Unit Conversions (e.g. "10 km to miles", "100 c to f", "50 kg to lbs")
	if m := unitConvertRegex.FindStringSubmatch(q); len(m) == 4 {
		val, _ := strconv.ParseFloat(m[1], 64)
		fromUnit := strings.ToLower(m[2])
		toUnit := strings.ToLower(m[3])

		converted, unitLabel, ok := convertUnits(val, fromUnit, toUnit)
		if ok {
			return &InstantAnswer{
				Type:        "converter",
				Title:       fmt.Sprintf("%g %s = %.4g %s", val, fromUnit, converted, unitLabel),
				Subtitle:    "Unit Conversion",
				Description: fmt.Sprintf("Standard conversion between %s and %s", fromUnit, toUnit),
				Badge:       "Unit Converter",
			}
		}
	}

	// 5. Time & Date
	if norm == "time" || norm == "time now" || norm == "current time" || norm == "what time is it" {
		now := time.Now().UTC()
		return &InstantAnswer{
			Type:        "fact",
			Title:       now.Format("15:04:05 UTC"),
			Subtitle:    now.Format("Monday, January 2, 2006"),
			Description: "Coordinated Universal Time (UTC)",
			Badge:       "Time",
		}
	}

	// 6. Tier 1: Curated High-Precision Knowledge Graph (0ms latency)
	if ans := matchCuratedKnowledgeGraph(norm); ans != nil {
		return ans
	}

	// 7. Tier 2: Dynamic Wikipedia AI Overview for factual/natural questions (<1200ms)
	if IsQuestionQuery(q) {
		if ans := resolveDynamicWikiOverview(q, norm); ans != nil {
			return ans
		}
	}

	return nil
}

// matchCuratedKnowledgeGraph resolves high-frequency global entities instantly
func matchCuratedKnowledgeGraph(norm string) *InstantAnswer {
	// A. World Leaders & Heads of Government
	if containsAll(norm, "prime minister", "india") || containsAll(norm, "pm", "india") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Narendra Modi",
			Subtitle:    "14th Prime Minister of India (in office since May 2014)",
			Description: "Narendra Damodardas Modi is an Indian politician serving as the 14th Prime Minister of India since May 26, 2014. He leads the Bharatiya Janata Party (BJP) and represents Varanasi in the Lok Sabha. He was re-elected for a third consecutive term in the 2024 general election.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Prime Minister's Office of India (pmindia.gov.in)",
			SourceURL:   "https://www.pmindia.gov.in/en/",
		}
	}

	if containsAll(norm, "president", "india") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Droupadi Murmu",
			Subtitle:    "15th President of India (in office since July 2022)",
			Description: "Droupadi Murmu is an Indian politician and former educator who has served as the 15th President of India since July 25, 2022. She is the first person from a tribal community and the second woman to hold the constitutional office.",
			Badge:       "Findra AI Overview",
			SourceTitle: "President of India (presidentofindia.gov.in)",
			SourceURL:   "https://presidentofindia.gov.in/",
		}
	}

	if containsAll(norm, "president", "usa") || containsAll(norm, "president", "united states") || containsAll(norm, "president", "america") || containsAll(norm, "us president") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Joe Biden",
			Subtitle:    "46th President of the United States (in office since January 2021)",
			Description: "Joseph Robinette Biden Jr. is an American politician serving as the 46th President of the United States since January 20, 2021. A member of the Democratic Party, he previously served as the 47th Vice President from 2009 to 2017 under Barack Obama.",
			Badge:       "Findra AI Overview",
			SourceTitle: "The White House (whitehouse.gov)",
			SourceURL:   "https://www.whitehouse.gov/",
		}
	}

	if containsAll(norm, "prime minister", "uk") || containsAll(norm, "pm", "uk") || containsAll(norm, "prime minister", "britain") || containsAll(norm, "prime minister", "united kingdom") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Keir Starmer",
			Subtitle:    "Prime Minister of the United Kingdom (in office since July 2024)",
			Description: "Sir Keir Rodney Starmer is a British politician and barrister serving as Prime Minister of the United Kingdom since July 5, 2024. He has served as Leader of the Labour Party since 2020.",
			Badge:       "Findra AI Overview",
			SourceTitle: "10 Downing Street (gov.uk)",
			SourceURL:   "https://www.gov.uk/government/organisations/prime-ministers-office-10-downing-street",
		}
	}

	if containsAll(norm, "king", "uk") || containsAll(norm, "monarch", "uk") || containsAll(norm, "king of england") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "King Charles III",
			Subtitle:    "King of the United Kingdom and 14 other Commonwealth realms",
			Description: "Charles III acceded to the British throne on September 8, 2022, following the passing of his mother, Queen Elizabeth II.",
			Badge:       "Findra AI Overview",
			SourceTitle: "The Royal Family (royal.uk)",
			SourceURL:   "https://www.royal.uk/",
		}
	}

	if containsAll(norm, "president", "france") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Emmanuel Macron",
			Subtitle:    "President of France (in office since May 2017)",
			Description: "Emmanuel Jean-Michel Frédéric Macron is a French politician who has served as President of France and ex officio Co-Prince of Andorra since May 14, 2017.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Élysée Palace (elysee.fr)",
			SourceURL:   "https://www.elysee.fr/en/",
		}
	}

	if containsAll(norm, "chancellor", "germany") || containsAll(norm, "prime minister", "germany") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Olaf Scholz",
			Subtitle:    "Chancellor of Germany (in office since December 2021)",
			Description: "Olaf Scholz is a German politician of the Social Democratic Party (SPD) who has served as Chancellor of the Federal Republic of Germany since December 8, 2021.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Federal Government of Germany (bundesregierung.de)",
			SourceURL:   "https://www.bundesregierung.de/breg-en",
		}
	}

	if containsAll(norm, "prime minister", "canada") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Justin Trudeau",
			Subtitle:    "23rd Prime Minister of Canada (in office since November 2015)",
			Description: "Justin Pierre James Trudeau is a Canadian politician who has served as the 23rd Prime Minister of Canada since 2015 and the leader of the Liberal Party since 2013.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Prime Minister of Canada (pm.gc.ca)",
			SourceURL:   "https://pm.gc.ca/en",
		}
	}

	if containsAll(norm, "prime minister", "japan") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Shigeru Ishiba",
			Subtitle:    "Prime Minister of Japan (in office since October 2024)",
			Description: "Shigeru Ishiba is a Japanese politician who has served as Prime Minister of Japan and President of the Liberal Democratic Party (LDP) since October 1, 2024.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Prime Minister of Japan and His Cabinet (kantei.go.jp)",
			SourceURL:   "https://japan.kantei.go.jp/",
		}
	}

	if containsAll(norm, "prime minister", "australia") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Anthony Albanese",
			Subtitle:    "31st Prime Minister of Australia (in office since May 2022)",
			Description: "Anthony Norman Albanese is an Australian politician serving as the 31st Prime Minister of Australia since May 23, 2022, and the federal leader of the Australian Labor Party.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Prime Minister of Australia (pm.gov.au)",
			SourceURL:   "https://www.pm.gov.au/",
		}
	}

	if containsAll(norm, "president", "russia") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Vladimir Putin",
			Subtitle:    "President of the Russian Federation",
			Description: "Vladimir Vladimirovich Putin is a Russian politician and former intelligence officer who is the current President of Russia, an office he has held since 2012, and previously from 2000 until 2008.",
			Badge:       "Findra AI Overview",
			SourceTitle: "President of Russia (kremlin.ru)",
			SourceURL:   "http://en.kremlin.ru/",
		}
	}

	if containsAll(norm, "president", "china") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Xi Jinping",
			Subtitle:    "President of China & General Secretary of the CCP",
			Description: "Xi Jinping is a Chinese politician who has been General Secretary of the Chinese Communist Party and Chairman of the Central Military Commission since 2012, and President of the People's Republic of China since 2013.",
			Badge:       "Findra AI Overview",
			SourceTitle: "State Council of the People's Republic of China",
			SourceURL:   "https://english.www.gov.cn/",
		}
	}

	if containsAll(norm, "prime minister", "italy") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Giorgia Meloni",
			Subtitle:    "Prime Minister of Italy (in office since October 2022)",
			Description: "Giorgia Meloni is an Italian politician who has served as Prime Minister of Italy since October 22, 2022. She is the first woman to hold the office.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Government of Italy (governo.it)",
			SourceURL:   "https://www.governo.it/en",
		}
	}

	if containsAll(norm, "president", "brazil") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Luiz Inácio Lula da Silva",
			Subtitle:    "39th President of Brazil (in office since January 2023)",
			Description: "Luiz Inácio Lula da Silva, widely known as Lula, is a Brazilian politician serving as the 39th President of Brazil since January 1, 2023.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Presidency of the Federative Republic of Brazil",
			SourceURL:   "https://www.gov.br/planalto/en",
		}
	}

	if containsAll(norm, "president", "ukraine") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Volodymyr Zelenskyy",
			Subtitle:    "6th President of Ukraine (in office since May 2019)",
			Description: "Volodymyr Oleksandrovych Zelenskyy is a Ukrainian politician who has served as the sixth President of Ukraine since May 20, 2019.",
			Badge:       "Findra AI Overview",
			SourceTitle: "President of Ukraine (president.gov.ua)",
			SourceURL:   "https://www.president.gov.ua/en",
		}
	}

	if containsAll(norm, "prime minister", "israel") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Benjamin Netanyahu",
			Subtitle:    "Prime Minister of Israel",
			Description: "Benjamin Netanyahu is an Israeli politician who has served as Prime Minister of Israel since December 2022, having previously held the office from 1996 to 1999 and from 2009 to 2021.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Prime Minister's Office of Israel",
			SourceURL:   "https://www.gov.il/en/departments/prime_ministers_office",
		}
	}

	// B. World Capitals
	capitals := map[string]struct{ city, country, desc string }{
		"india":          {"New Delhi", "India", "New Delhi is the capital of India and seat of all three branches of the Government of India."},
		"france":         {"Paris", "France", "Paris is the capital and most populous city of France, situated along the Seine River."},
		"united states":  {"Washington, D.C.", "United States", "Washington, D.C. is the capital city and federal district of the United States."},
		"usa":            {"Washington, D.C.", "United States", "Washington, D.C. is the capital city and federal district of the United States."},
		"united kingdom": {"London", "United Kingdom", "London is the capital and largest city of the United Kingdom, standing on the River Thames."},
		"uk":             {"London", "United Kingdom", "London is the capital and largest city of the United Kingdom, standing on the River Thames."},
		"england":        {"London", "England", "London is the capital city of England and the United Kingdom."},
		"japan":          {"Tokyo", "Japan", "Tokyo is the capital and most populous prefecture of Japan, located at the head of Tokyo Bay."},
		"germany":        {"Berlin", "Germany", "Berlin is the capital and largest city of Germany by both area and population."},
		"canada":         {"Ottawa", "Canada", "Ottawa is the capital city of Canada, located in the province of Ontario on the south bank of the Ottawa River."},
		"australia":      {"Canberra", "Australia", "Canberra is the federal capital of Australia, located in the Australian Capital Territory."},
		"china":          {"Beijing", "China", "Beijing is the capital of the People's Republic of China and the world's most populous national capital city."},
		"italy":          {"Rome", "Italy", "Rome is the capital city of Italy, famed for nearly three millennia of globally influential art, architecture, and culture."},
		"spain":          {"Madrid", "Spain", "Madrid is the capital and most populous city of Spain, situated on the Manzanares River."},
		"russia":         {"Moscow", "Russia", "Moscow is the capital and largest city of Russia, situated on the Moskva River in western Russia."},
		"brazil":         {"Brasília", "Brazil", "Brasília is the federal capital of Brazil, inaugurated in 1960 and renowned for its white, modern architecture by Oscar Niemeyer."},
		"south korea":    {"Seoul", "South Korea", "Seoul is the capital and largest metropolis of South Korea, situated on the Han River."},
		"egypt":          {"Cairo", "Egypt", "Cairo is the capital of Egypt and the largest metropolitan area in the Middle East and the Arab world."},
		"turkey":         {"Ankara", "Turkey", "Ankara is the capital city of Turkey, located in the central part of Anatolia."},
		"switzerland":    {"Bern", "Switzerland", "Bern is the de facto capital of Switzerland, referred to as the 'federal city' (Bundesstadt)."},
		"netherlands":    {"Amsterdam", "Netherlands", "Amsterdam is the capital and most populous city of the Netherlands, known for its historic canals."},
		"sweden":         {"Stockholm", "Sweden", "Stockholm is the capital and most populous urban area in Sweden as well as in Scandinavia."},
		"norway":         {"Oslo", "Norway", "Oslo is the capital and most populous city of Norway, located at the head of the Oslofjord."},
		"denmark":        {"Copenhagen", "Denmark", "Copenhagen is the capital and most populous city of Denmark, situated on the eastern coast of Zealand."},
		"greece":         {"Athens", "Greece", "Athens is the capital and largest city of Greece, dominating the Attica region with over 3,400 years of recorded history."},
		"portugal":       {"Lisbon", "Portugal", "Lisbon is the capital and the largest city of Portugal, located at the mouth of the Tagus River."},
		"mexico":         {"Mexico City", "Mexico", "Mexico City is the capital and largest city of Mexico, situated in the high-altitude Valley of Mexico."},
		"argentina":      {"Buenos Aires", "Argentina", "Buenos Aires is the capital and primate city of Argentina, located on the western shore of the Río de la Plata."},
		"saudi arabia":   {"Riyadh", "Saudi Arabia", "Riyadh is the capital and largest city of Saudi Arabia, situated in the center of the an-Nafud desert."},
		"uae":            {"Abu Dhabi", "United Arab Emirates", "Abu Dhabi is the capital and second-most populous city of the United Arab Emirates."},
		"thailand":       {"Bangkok", "Thailand", "Bangkok is the capital and most populous city of Thailand, known locally as Krung Thep Maha Nakhon."},
		"singapore":      {"Singapore", "Singapore", "Singapore is an island sovereign city-state and country in Southeast Asia."},
		"new zealand":    {"Wellington", "New Zealand", "Wellington is the capital city of New Zealand, located at the south-western tip of the North Island."},
		"pakistan":       {"Islamabad", "Pakistan", "Islamabad is the capital city of Pakistan, situated within the federal Islamabad Capital Territory."},
		"bangladesh":     {"Dhaka", "Bangladesh", "Dhaka is the capital and largest city of Bangladesh, located in the Ganges Delta."},
	}

	if strings.Contains(norm, "capital") {
		for country, data := range capitals {
			if strings.Contains(norm, country) {
				return &InstantAnswer{
					Type:        "ai_overview",
					Title:       data.city,
					Subtitle:    fmt.Sprintf("Capital of %s", data.country),
					Description: data.desc,
					Badge:       "Findra AI Overview",
					SourceTitle: fmt.Sprintf("Encyclopedia Entry for %s", data.country),
					SourceURL:   fmt.Sprintf("https://en.wikipedia.org/wiki/%s", strings.ReplaceAll(data.city, " ", "_")),
				}
			}
		}
	}

	// C. Tech Founders & CEOs
	if containsAll(norm, "ceo", "apple") || containsAll(norm, "chief executive", "apple") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Tim Cook",
			Subtitle:    "Chief Executive Officer of Apple Inc. (since August 2011)",
			Description: "Timothy Donald Cook is an American business executive who has served as the chief executive officer of Apple Inc. since August 24, 2011, succeeding co-founder Steve Jobs.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Apple Leadership (apple.com)",
			SourceURL:   "https://www.apple.com/leadership/tim-cook/",
		}
	}

	if containsAll(norm, "founder", "apple") || containsAll(norm, "created apple") || containsAll(norm, "who started apple") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Steve Jobs, Steve Wozniak, & Ronald Wayne",
			Subtitle:    "Founded Apple Computer Company on April 1, 1976",
			Description: "Apple was founded by Steve Jobs, Steve Wozniak, and Ronald Wayne in Los Altos, California to develop and sell Wozniak's Apple I personal computer. It was incorporated as Apple Computer, Inc. in January 1977.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Apple Inc. History",
			SourceURL:   "https://en.wikipedia.org/wiki/Apple_Inc.#1976–1980:_Founding_and_incorporation",
		}
	}

	if containsAll(norm, "ceo", "google") || containsAll(norm, "ceo", "alphabet") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Sundar Pichai",
			Subtitle:    "CEO of Alphabet Inc. and Google LLC",
			Description: "Pichai Sundararajan, known as Sundar Pichai, has served as the CEO of Google since October 2015 and of parent company Alphabet Inc. since December 2019.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Google Leadership (abc.xyz)",
			SourceURL:   "https://abc.xyz/investor/management/",
		}
	}

	if containsAll(norm, "founder", "google") || containsAll(norm, "who created google") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Larry Page & Sergey Brin",
			Subtitle:    "Founded Google on September 4, 1998 (Stanford University)",
			Description: "Google was founded while Larry Page and Sergey Brin were Ph.D. students at Stanford University in California. They developed the PageRank algorithm to rank web search results.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Google History",
			SourceURL:   "https://about.google/our-story/",
		}
	}

	if containsAll(norm, "ceo", "microsoft") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Satya Nadella",
			Subtitle:    "Chairman and CEO of Microsoft Corporation",
			Description: "Satya Narayana Nadella is an Indian-American business executive who has served as the CEO of Microsoft since February 2014 and Chairman since 2021.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Microsoft Leadership (microsoft.com)",
			SourceURL:   "https://news.microsoft.com/exec/satya-nadella/",
		}
	}

	if containsAll(norm, "founder", "microsoft") || containsAll(norm, "who created microsoft") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Bill Gates & Paul Allen",
			Subtitle:    "Founded Microsoft on April 4, 1975 in Albuquerque, New Mexico",
			Description: "Microsoft was founded by childhood friends Bill Gates and Paul Allen to develop and sell BASIC interpreters for the Altair 8800 microcomputer.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Microsoft History",
			SourceURL:   "https://news.microsoft.com/facts-about-microsoft/",
		}
	}

	if containsAll(norm, "ceo", "tesla") || containsAll(norm, "ceo", "spacex") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Elon Musk",
			Subtitle:    "CEO of Tesla, Inc. & CTO/CEO of SpaceX",
			Description: "Elon Reeve Musk is a businessman and investor who serves as CEO and product architect of Tesla, Inc., and founder, CEO, and chief engineer of SpaceX.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Tesla Leadership (tesla.com)",
			SourceURL:   "https://www.tesla.com/elon-musk",
		}
	}

	if containsAll(norm, "ceo", "meta") || containsAll(norm, "ceo", "facebook") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Mark Zuckerberg",
			Subtitle:    "Founder, Chairman, and CEO of Meta Platforms",
			Description: "Mark Elliot Zuckerberg co-founded Facebook at Harvard University in 2004 and serves as the chairman and chief executive officer of Meta Platforms, Inc.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Meta Leadership (about.meta.com)",
			SourceURL:   "https://about.meta.com/leadership/mark-zuckerberg/",
		}
	}

	if containsAll(norm, "ceo", "nvidia") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Jensen Huang",
			Subtitle:    "Founder, President, and CEO of Nvidia Corporation",
			Description: "Jen-Hsun 'Jensen' Huang is an electrical engineer and businessman who co-founded Nvidia Corporation in 1993 and has served as its president and CEO since its inception.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Nvidia Executive Bios (nvidia.com)",
			SourceURL:   "https://www.nvidia.com/en-us/about-nvidia/leadership-team/jensen-huang/",
		}
	}

	if containsAll(norm, "ceo", "openai") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Sam Altman",
			Subtitle:    "Chief Executive Officer of OpenAI",
			Description: "Samuel Harris Altman is an American entrepreneur and investor who serves as the CEO of OpenAI, the artificial intelligence research lab behind ChatGPT and GPT-4.",
			Badge:       "Findra AI Overview",
			SourceTitle: "OpenAI Leadership (openai.com)",
			SourceURL:   "https://openai.com/about/",
		}
	}

	// D. Science & Geographic Constants
	if containsAll(norm, "speed of light") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "299,792,458 m/s (approx. 300,000 km/s)",
			Subtitle:    "Universal Physical Constant (c)",
			Description: "The speed of light in vacuum is exactly 299,792,458 meters per second (approximately 186,282 miles per second). In Einstein's special relativity, it is the universal upper speed limit at which conventional matter, energy, and information can travel.",
			Badge:       "Findra AI Overview",
			SourceTitle: "NIST Physical Measurement Laboratory",
			SourceURL:   "https://physics.nist.gov/cgi-bin/cuu/Value?c",
		}
	}

	if containsAll(norm, "speed of sound") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "343 m/s (1,235 km/h / 767 mph)",
			Subtitle:    "Speed of Sound in Dry Air at 20 °C (68 °F)",
			Description: "The speed of sound is the distance travelled per unit of time by a sound wave propagating through an elastic medium. In dry air at 20 °C (68 °F), the speed of sound is 343 meters per second.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Standard Acoustic Constants",
			SourceURL:   "https://en.wikipedia.org/wiki/Speed_of_sound",
		}
	}

	if containsAll(norm, "highest mountain") || containsAll(norm, "tallest mountain") || norm == "mount everest" {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Mount Everest (8,848.86 m / 29,031.7 ft)",
			Subtitle:    "Earth's Highest Mountain Above Sea Level",
			Description: "Mount Everest is Earth's highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas on the border between Nepal and the Tibet Autonomous Region of China.",
			Badge:       "Findra AI Overview",
			SourceTitle: "Survey of Nepal & China Joint National Elevation",
			SourceURL:   "https://en.wikipedia.org/wiki/Mount_Everest",
		}
	}

	if containsAll(norm, "deepest ocean") || containsAll(norm, "deepest point on earth") || containsAll(norm, "mariana trench") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Mariana Trench (Challenger Deep, ~10,994 m / 36,070 ft)",
			Subtitle:    "Deepest Known Oceanic Trench on Earth",
			Description: "The Mariana Trench is an oceanic trench located in the western Pacific Ocean. Its deepest point, the Challenger Deep, reaches a depth of approximately 10,994 meters (36,070 feet / 6.8 miles) below sea level.",
			Badge:       "Findra AI Overview",
			SourceTitle: "National Oceanic and Atmospheric Administration (NOAA)",
			SourceURL:   "https://oceanexplorer.noaa.gov/facts/mariana-trench.html",
		}
	}

	if containsAll(norm, "largest planet") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "Jupiter (142,984 km diameter)",
			Subtitle:    "Fifth and Largest Planet from the Sun",
			Description: "Jupiter is the largest planet in the Solar System. It is a gas giant with a mass more than two and a half times that of all the other planets in the Solar System combined, and 11 times the diameter of Earth.",
			Badge:       "Findra AI Overview",
			SourceTitle: "NASA Solar System Exploration",
			SourceURL:   "https://solarsystem.nasa.gov/planets/jupiter/overview/",
		}
	}

	if containsAll(norm, "distance to the moon") || containsAll(norm, "distance to moon") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "384,400 km (238,855 miles)",
			Subtitle:    "Average Distance from Earth to the Moon (1.28 light-seconds)",
			Description: "The Moon's orbit is elliptical, so its distance from Earth varies from approximately 363,300 km (225,623 mi) at perigee (closest) to 405,500 km (251,966 mi) at apogee (farthest).",
			Badge:       "Findra AI Overview",
			SourceTitle: "NASA Lunar Exploration",
			SourceURL:   "https://moon.nasa.gov/",
		}
	}

	if containsAll(norm, "distance to the sun") || containsAll(norm, "distance to sun") {
		return &InstantAnswer{
			Type:        "ai_overview",
			Title:       "149,597,870.7 km (~93 million miles)",
			Subtitle:    "1 Astronomical Unit (AU) / ~8.3 Light-Minutes",
			Description: "The astronomical unit (AU) is defined as exactly 149,597,870,700 meters. Light emitted from the surface of the Sun takes approximately 8 minutes and 20 seconds to reach Earth.",
			Badge:       "Findra AI Overview",
			SourceTitle: "International Astronomical Union (IAU)",
			SourceURL:   "https://en.wikipedia.org/wiki/Astronomical_unit",
		}
	}

	// E. Foundational Computer Science Algorithms
	if norm == "what is pagerank" || norm == "define pagerank" || norm == "pagerank" {
		return &InstantAnswer{
			Type:        "definition",
			Title:       "PageRank Algorithm (Google)",
			Subtitle:    "Link-Analysis Graph Authority Algorithm",
			Description: "PageRank assigns a numerical authority score to hyperlinked documents by modeling a random surfer: P(u) = (1-d)/N + d × Σ [P(v) / L(v)], where d is the damping factor (~0.85). Pages referenced by high-authority hubs inherit greater weight.",
			Badge:       "IR Algorithm",
			SourceTitle: "The Anatomy of a Large-Scale Hypertextual Web Search Engine (Brin & Page, 1998)",
			SourceURL:   "http://infolab.stanford.edu/~backrub/google.html",
		}
	}

	if norm == "what is bm25" || norm == "define bm25" || norm == "okapi bm25" {
		return &InstantAnswer{
			Type:        "definition",
			Title:       "Okapi BM25 Ranking Function",
			Subtitle:    "Probabilistic Relevance Framework in Information Retrieval",
			Description: "BM25 estimates relevance based on query term frequency with non-linear saturation and document length normalization: Score(D,Q) = Σ IDF(q) × [f(q,D)·(k1+1)] / [f(q,D) + k1·(1 - b + b·|D|/avgdl)]. Findra uses BM25F with fielded weights.",
			Badge:       "IR Algorithm",
			SourceTitle: "Okapi at TREC-3 (Stephen E. Robertson et al., 1994)",
			SourceURL:   "https://en.wikipedia.org/wiki/Okapi_BM25",
		}
	}

	return nil
}

// containsAll checks if all targets are present as substrings in s
func containsAll(s string, targets ...string) bool {
	for _, t := range targets {
		if !strings.Contains(s, t) {
			return false
		}
	}
	return true
}

// resolveDynamicWikiOverview queries Wikipedia's fast REST API to generate an AI Overview for any question
func resolveDynamicWikiOverview(rawQuery, normQuery string) *InstantAnswer {
	// Check in-memory cache first
	cacheKey := "wiki_ai:" + normQuery
	if cached, ok := wikiCache.Load(cacheKey); ok {
		if ans, ok := cached.(*InstantAnswer); ok {
			return ans
		}
	}

	// Extract subject candidate
	subject := extractSubjectFromQuestion(rawQuery, normQuery)
	if subject == "" {
		return nil
	}

	// 1. Try direct summary for formatted subject
	ans := fetchWikiSummary(subject)
	if ans != nil {
		wikiCache.Store(cacheKey, ans)
		return ans
	}

	// 2. If direct title 404s, query Wikipedia Opensearch / Search API for best entity match
	searchTitle := fetchTopWikiPageTitle(subject)
	if searchTitle != "" && !strings.EqualFold(searchTitle, subject) {
		if ans = fetchWikiSummary(searchTitle); ans != nil {
			wikiCache.Store(cacheKey, ans)
			return ans
		}
	}

	return nil
}

// extractSubjectFromQuestion strips typical question wrappers to isolate the core entity
func extractSubjectFromQuestion(rawQuery, normQuery string) string {
	q := strings.TrimRight(strings.TrimSpace(rawQuery), "?!.")
	qLower := strings.ToLower(q)

	questionPrefixes := []string{
		"who is the", "who was the", "who is", "who was", "who are the", "who are", "who were the", "who were",
		"what is the", "what was the", "what is", "what was", "what are the", "what are", "what does",
		"where is the", "where is", "where was", "where are",
		"when was the", "when did", "when was", "when is",
		"tell me about the", "tell me about",
		"define the", "define", "meaning of the", "meaning of",
		"capital of", "currency of", "founder of", "ceo of", "president of", "prime minister of",
	}

	for _, pfx := range questionPrefixes {
		if strings.HasPrefix(qLower, pfx) {
			remainder := strings.TrimSpace(q[len(pfx):])
			remainder = strings.TrimPrefix(remainder, "the ")
			remainder = strings.TrimSpace(remainder)
			if remainder != "" {
				return remainder
			}
		}
	}

	return q
}

type wikiSummaryResp struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Extract     string `json:"extract"`
	ContentURLs struct {
		Desktop struct {
			Page string `json:"page"`
		} `json:"desktop"`
	} `json:"content_urls"`
}

func fetchWikiSummary(title string) *InstantAnswer {
	formattedTitle := strings.ReplaceAll(strings.TrimSpace(title), " ", "_")
	endpoint := fmt.Sprintf("https://en.wikipedia.org/api/rest_v1/page/summary/%s", url.PathEscape(formattedTitle))

	ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "FindraSearch/2.0 (AI Overview Service; https://findra.local)")

	resp, err := wikiClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()

	var data wikiSummaryResp
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	if data.Extract == "" || len(data.Extract) < 15 {
		return nil
	}

	// Synthesize clean sentences (take up to 3 sentences for high readability)
	sentences := splitSentences(data.Extract)
	var synthDesc string
	if len(sentences) > 3 {
		synthDesc = strings.Join(sentences[:3], " ")
	} else {
		synthDesc = data.Extract
	}

	return &InstantAnswer{
		Type:        "ai_overview",
		Title:       data.Title,
		Subtitle:    data.Description,
		Description: synthDesc,
		Badge:       "Findra AI Overview",
		SourceTitle: fmt.Sprintf("Wikipedia: %s", data.Title),
		SourceURL:   data.ContentURLs.Desktop.Page,
	}
}

type wikiSearchResp struct {
	Query struct {
		Search []struct {
			Title string `json:"title"`
		} `json:"search"`
	} `json:"query"`
}

func fetchTopWikiPageTitle(query string) string {
	endpoint := fmt.Sprintf("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&format=json&utf8=1&srlimit=1", url.QueryEscape(query))

	ctx, cancel := context.WithTimeout(context.Background(), 1000*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "FindraSearch/2.0 (AI Overview Service; https://findra.local)")

	resp, err := wikiClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			_ = resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()

	var data wikiSearchResp
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return ""
	}

	if len(data.Query.Search) > 0 {
		return data.Query.Search[0].Title
	}
	return ""
}

// ExtractSnippetAIOverview extracts a concise AI Overview from top web result snippets when query has question intent
func ExtractSnippetAIOverview(query string, items []SearchResultItem) *InstantAnswer {
	if len(items) == 0 || !IsQuestionQuery(query) {
		return nil
	}

	top := items[0]
	if top.Snippet == "" || len(top.Snippet) < 25 {
		return nil
	}

	sentences := splitSentences(top.Snippet)
	if len(sentences) == 0 {
		return nil
	}

	firstSentence := sentences[0]
	if len(firstSentence) < 20 {
		return nil
	}

	return &InstantAnswer{
		Type:        "ai_overview",
		Title:       top.Title,
		Subtitle:    fmt.Sprintf("Answer from %s", top.Domain),
		Description: firstSentence,
		Badge:       "Findra AI Overview",
		SourceTitle: top.Title,
		SourceURL:   top.URL,
	}
}

func splitSentences(text string) []string {
	var sentences []string
	raw := strings.Split(text, ". ")
	for _, s := range raw {
		s = strings.TrimSpace(s)
		if s != "" {
			if !strings.HasSuffix(s, ".") {
				s += "."
			}
			sentences = append(sentences, s)
		}
	}
	return sentences
}

func convertUnits(val float64, from, to string) (float64, string, bool) {
	// Length
	if (from == "km" || from == "kilometers") && (to == "miles" || to == "mile") {
		return val * 0.621371, "miles", true
	}
	if (from == "miles" || from == "mile") && (to == "km" || to == "kilometers") {
		return val * 1.60934, "km", true
	}
	if (from == "meters" || from == "m") && (to == "feet" || to == "ft") {
		return val * 3.28084, "feet", true
	}
	if (from == "feet" || from == "ft") && (to == "meters" || to == "m") {
		return val * 0.3048, "meters", true
	}
	if (from == "inches" || from == "in") && (to == "cm" || to == "centimeters") {
		return val * 2.54, "cm", true
	}
	if (from == "cm" || from == "centimeters") && (to == "inches" || to == "in") {
		return val / 2.54, "inches", true
	}

	// Weight
	if (from == "kg" || from == "kilograms") && (to == "lbs" || to == "pounds") {
		return val * 2.20462, "lbs", true
	}
	if (from == "lbs" || from == "pounds") && (to == "kg" || to == "kilograms") {
		return val * 0.453592, "kg", true
	}

	// Temperature
	if (from == "c" || from == "celsius") && (to == "f" || to == "fahrenheit") {
		return (val * 9.0 / 5.0) + 32.0, "°F", true
	}
	if (from == "f" || from == "fahrenheit") && (to == "c" || to == "celsius") {
		return (val - 32.0) * 5.0 / 9.0, "°C", true
	}

	// Digital Data
	if (from == "mb" || from == "megabytes") && (to == "gb" || to == "gigabytes") {
		return val / 1024.0, "GB", true
	}
	if (from == "gb" || from == "gigabytes") && (to == "mb" || to == "megabytes") {
		return val * 1024.0, "MB", true
	}
	if (from == "tb" || from == "terabytes") && (to == "gb" || to == "gigabytes") {
		return val * 1024.0, "GB", true
	}

	return 0, "", false
}
