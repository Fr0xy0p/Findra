/// Porter Stemmer implementation in Rust (matches Python text_processor.py)

pub struct Stemmer {
    b: Vec<char>,
    k: usize,
    k0: usize,
    j: usize,
}

impl Stemmer {
    pub fn new() -> Self {
        Self {
            b: Vec::new(),
            k: 0,
            k0: 0,
            j: 0,
        }
    }

    fn is_consonant(&self, i: usize) -> bool {
        match self.b[i] {
            'a' | 'e' | 'i' | 'o' | 'u' => false,
            'y' => {
                if i == self.k0 {
                    true
                } else {
                    !self.is_consonant(i - 1)
                }
            }
            _ => true,
        }
    }

    fn measure(&self) -> usize {
        let mut n = 0;
        let mut i = self.k0;
        loop {
            if i > self.j { return n; }
            if !self.is_consonant(i) { break; }
            i += 1;
        }
        i += 1;
        loop {
            loop {
                if i > self.j { return n; }
                if self.is_consonant(i) { break; }
                i += 1;
            }
            i += 1;
            n += 1;
            loop {
                if i > self.j { return n; }
                if !self.is_consonant(i) { break; }
                i += 1;
            }
            i += 1;
        }
    }

    fn vowel_in_stem(&self) -> bool {
        for i in self.k0..=self.j {
            if !self.is_consonant(i) {
                return true;
            }
        }
        false
    }

    fn double_consonant(&self, i: usize) -> bool {
        if i < self.k0 + 1 { return false; }
        if self.b[i] != self.b[i - 1] { return false; }
        self.is_consonant(i)
    }

    fn cvc(&self, i: usize) -> bool {
        if i < self.k0 + 2 || !self.is_consonant(i) || self.is_consonant(i - 1) || !self.is_consonant(i - 2) {
            return false;
        }
        let ch = self.b[i];
        if ch == 'w' || ch == 'x' || ch == 'y' {
            return false;
        }
        true
    }

    fn ends(&mut self, s: &str) -> bool {
        let s_chars: Vec<char> = s.chars().collect();
        let len = s_chars.len();
        if len > self.k + 1 { return false; }
        let o = self.k + 1 - len;
        if o < self.k0 { return false; }

        for i in 0..len {
            if self.b[o + i] != s_chars[i] {
                return false;
            }
        }
        self.j = self.k - len;
        true
    }

    fn set_to(&mut self, s: &str) {
        let s_chars: Vec<char> = s.chars().collect();
        let len = s_chars.len();
        let o = self.j + 1;
        self.b.truncate(o);
        self.b.extend_from_slice(&s_chars);
        self.k = self.j + len;
    }

    fn replace_m(&mut self, s: &str) {
        if self.measure() > 0 {
            self.set_to(s);
        }
    }

    fn step1ab(&mut self) {
        if self.b[self.k] == 's' {
            if self.ends("sses") {
                self.k -= 2;
                self.b.truncate(self.k + 1);
            } else if self.ends("ies") {
                self.set_to("i");
            } else if self.k > 0 && self.b[self.k - 1] != 's' {
                self.k -= 1;
                self.b.truncate(self.k + 1);
            }
        }
        if self.ends("eed") {
            if self.measure() > 0 {
                self.k -= 1;
                self.b.truncate(self.k + 1);
            }
        } else if (self.ends("ed") || self.ends("ing")) && self.vowel_in_stem() {
            self.k = self.j;
            self.b.truncate(self.k + 1);
            if self.ends("at") {
                self.set_to("ate");
            } else if self.ends("bl") {
                self.set_to("ble");
            } else if self.ends("iz") {
                self.set_to("ize");
            } else if self.double_consonant(self.k) {
                self.k -= 1;
                let ch = self.b[self.k];
                if ch == 'l' || ch == 's' || ch == 'z' {
                    self.k += 1;
                } else {
                    self.b.truncate(self.k + 1);
                }
            } else if self.measure() == 1 && self.cvc(self.k) {
                self.set_to("e");
            }
        }
    }

    fn step1c(&mut self) {
        if self.ends("y") && self.vowel_in_stem() {
            self.b[self.k] = 'i';
        }
    }

    fn step2(&mut self) {
        if self.k <= self.k0 + 1 { return; }
        match self.b[self.k - 1] {
            'a' => {
                if self.ends("ational") { self.replace_m("ate"); }
                else if self.ends("tional") { self.replace_m("tion"); }
            }
            'c' => {
                if self.ends("enci") { self.replace_m("ence"); }
                else if self.ends("anci") { self.replace_m("ance"); }
            }
            'e' => {
                if self.ends("izer") { self.replace_m("ize"); }
            }
            'l' => {
                if self.ends("bli") { self.replace_m("ble"); }
                else if self.ends("alli") { self.replace_m("al"); }
                else if self.ends("entli") { self.replace_m("ent"); }
                else if self.ends("eli") { self.replace_m("e"); }
                else if self.ends("ousli") { self.replace_m("ous"); }
            }
            'o' => {
                if self.ends("ization") { self.replace_m("ize"); }
                else if self.ends("ation") { self.replace_m("ate"); }
                else if self.ends("ator") { self.replace_m("ate"); }
            }
            's' => {
                if self.ends("alism") { self.replace_m("al"); }
                else if self.ends("iveness") { self.replace_m("ive"); }
                else if self.ends("fulness") { self.replace_m("ful"); }
                else if self.ends("ousness") { self.replace_m("ous"); }
            }
            't' => {
                if self.ends("aliti") { self.replace_m("al"); }
                else if self.ends("iviti") { self.replace_m("ive"); }
                else if self.ends("biliti") { self.replace_m("ble"); }
            }
            'g' => {
                if self.ends("logi") { self.replace_m("log"); }
            }
            _ => {}
        }
    }

    fn step3(&mut self) {
        if self.k <= self.k0 { return; }
        match self.b[self.k] {
            'e' => {
                if self.ends("icate") { self.replace_m("ic"); }
                else if self.ends("ative") { self.replace_m(""); }
                else if self.ends("alize") { self.replace_m("al"); }
            }
            'i' => {
                if self.ends("iciti") { self.replace_m("ic"); }
            }
            'l' => {
                if self.ends("ical") { self.replace_m("ic"); }
                else if self.ends("ful") { self.replace_m(""); }
            }
            's' => {
                if self.ends("ness") { self.replace_m(""); }
            }
            _ => {}
        }
    }

    fn step4(&mut self) {
        if self.k <= self.k0 + 1 { return; }
        match self.b[self.k - 1] {
            'a' => { if self.ends("al") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'c' => { if (self.ends("ance") || self.ends("ence")) && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'e' => { if self.ends("er") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'i' => { if self.ends("ic") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'l' => { if (self.ends("able") || self.ends("ible")) && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'n' => { if (self.ends("ant") || self.ends("ement") || self.ends("ment") || self.ends("ent")) && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'o' => {
                if self.ends("ion") && self.j >= self.k0 && (self.b[self.j] == 's' || self.b[self.j] == 't') && self.measure() > 1 {
                    self.k = self.j;
                    self.b.truncate(self.k + 1);
                }
            }
            's' => { if self.ends("ism") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            't' => { if (self.ends("ate") || self.ends("iti")) && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'u' => { if self.ends("ous") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'v' => { if self.ends("ive") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            'z' => { if self.ends("ize") && self.measure() > 1 { self.k = self.j; self.b.truncate(self.k + 1); } }
            _ => {}
        }
    }

    fn step5(&mut self) {
        self.j = self.k;
        if self.b[self.k] == 'e' {
            let a = self.measure();
            if a > 1 || (a == 1 && !self.cvc(self.k - 1)) {
                self.k -= 1;
                self.b.truncate(self.k + 1);
            }
        }
        if self.k > 0 && self.b[self.k] == 'l' && self.double_consonant(self.k) && self.measure() > 1 {
            self.k -= 1;
            self.b.truncate(self.k + 1);
        }
    }

    pub fn stem(&mut self, word: &str) -> String {
        let clean = word.to_lowercase();
        if clean.len() <= 2 {
            return clean;
        }
        self.b = clean.chars().collect();
        self.k = self.b.len() - 1;
        self.k0 = 0;
        self.step1ab();
        self.step1c();
        self.step2();
        self.step3();
        self.step4();
        self.step5();
        self.b.iter().collect()
    }
}

pub fn stem_word(word: &str) -> String {
    let mut stemmer = Stemmer::new();
    stemmer.stem(word)
}
