/**
 * PageRank & TrustRank Anti-Spam Engine in C++20 (Google-grade Link Analysis).
 * Sparse matrix power iteration over directed link graphs.
 * Computes:
 *  1. Standard PageRank (Uniform Teleportation)
 *  2. TrustRank (Biased Teleportation from Human-Verified Seeds)
 *  3. Spam Penalty / Trust Multiplier
 */

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <chrono>
#include <algorithm>

struct Edge {
    int src;
    int target;
};

class GraphEngine {
private:
    int num_nodes;
    std::vector<int> out_degree;
    std::vector<std::vector<int>> in_links;
    std::vector<int> dangling_nodes;

public:
    GraphEngine(int n) : num_nodes(n), out_degree(n, 0), in_links(n) {}

    void add_edge(int src, int target) {
        if (src >= 0 && src < num_nodes && target >= 0 && target < num_nodes) {
            out_degree[src]++;
            in_links[target].push_back(src);
        }
    }

    void finalize_graph() {
        dangling_nodes.clear();
        for (int i = 0; i < num_nodes; ++i) {
            if (out_degree[i] == 0) {
                dangling_nodes.push_back(i);
            }
        }
    }

    // 1. Standard PageRank (Uniform Random Surfer)
    std::vector<double> compute_pagerank(double damping = 0.85, double epsilon = 1e-7, int max_iter = 100) {
        finalize_graph();
        if (num_nodes == 0) return {};

        std::vector<double> pr(num_nodes, 1.0 / num_nodes);
        std::vector<double> pr_next(num_nodes, 0.0);

        for (int iter = 1; iter <= max_iter; ++iter) {
            double dangling_mass = 0.0;
            for (int dangling_idx : dangling_nodes) {
                dangling_mass += pr[dangling_idx];
            }

            double base_value = (1.0 - damping) / num_nodes + (damping * dangling_mass) / num_nodes;

            for (int i = 0; i < num_nodes; ++i) {
                double rank_sum = 0.0;
                for (int incoming_node : in_links[i]) {
                    rank_sum += pr[incoming_node] / out_degree[incoming_node];
                }
                pr_next[i] = base_value + damping * rank_sum;
            }

            double l1_diff = 0.0;
            for (int i = 0; i < num_nodes; ++i) {
                l1_diff += std::abs(pr_next[i] - pr[i]);
                pr[i] = pr_next[i];
            }

            if (l1_diff < epsilon) break;
        }

        return pr;
    }

    // 2. Google TrustRank (Biased Random Walk from Verified Seed Nodes)
    std::vector<double> compute_trustrank(const std::vector<int>& seed_nodes, double damping = 0.85, double epsilon = 1e-7, int max_iter = 100) {
        finalize_graph();
        if (num_nodes == 0) return {};

        std::vector<double> teleport(num_nodes, 0.0);
        if (seed_nodes.empty()) {
            for (int i = 0; i < num_nodes; ++i) teleport[i] = 1.0 / num_nodes;
        } else {
            double seed_weight = 1.0 / seed_nodes.size();
            for (int s : seed_nodes) {
                if (s >= 0 && s < num_nodes) teleport[s] = seed_weight;
            }
        }

        std::vector<double> tr = teleport;
        std::vector<double> tr_next(num_nodes, 0.0);

        for (int iter = 1; iter <= max_iter; ++iter) {
            double dangling_mass = 0.0;
            for (int dangling_idx : dangling_nodes) {
                dangling_mass += tr[dangling_idx];
            }

            for (int i = 0; i < num_nodes; ++i) {
                double rank_sum = 0.0;
                for (int incoming : in_links[i]) {
                    rank_sum += tr[incoming] / out_degree[incoming];
                }
                // Trust teleportation biased towards trusted seeds
                tr_next[i] = (1.0 - damping) * teleport[i] + damping * (rank_sum + dangling_mass * teleport[i]);
            }

            double l1_diff = 0.0;
            for (int i = 0; i < num_nodes; ++i) {
                l1_diff += std::abs(tr_next[i] - tr[i]);
                tr[i] = tr_next[i];
            }

            if (l1_diff < epsilon) break;
        }

        return tr;
    }
};

// JSON parser for link_graph.json
bool parse_link_graph(const std::string& filepath, int& num_nodes, std::vector<Edge>& edges) {
    std::ifstream file(filepath);
    if (!file.is_open()) return false;

    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    file.close();

    size_t node_pos = content.find("\"num_nodes\":");
    if (node_pos == std::string::npos) return false;
    size_t colon_pos = content.find(":", node_pos);
    size_t comma_pos = content.find(",", colon_pos);
    num_nodes = std::stoi(content.substr(colon_pos + 1, comma_pos - colon_pos - 1));

    size_t edge_pos = content.find("\"edges\":");
    if (edge_pos == std::string::npos) return false;
    size_t list_start = content.find("[", edge_pos);
    size_t list_end = content.find("]", content.rfind("]"));

    size_t cur = list_start + 1;
    while (cur < list_end) {
        size_t open_bracket = content.find("[", cur);
        if (open_bracket == std::string::npos || open_bracket >= list_end) break;
        size_t close_bracket = content.find("]", open_bracket);
        if (close_bracket == std::string::npos) break;

        std::string edge_str = content.substr(open_bracket + 1, close_bracket - open_bracket - 1);
        size_t sep = edge_str.find(",");
        if (sep != std::string::npos) {
            int src = std::stoi(edge_str.substr(0, sep));
            int tgt = std::stoi(edge_str.substr(sep + 1));
            edges.push_back({src, tgt});
        }
        cur = close_bracket + 1;
    }

    return true;
}

int main(int argc, char* argv[]) {
    std::string input_path = "data/parsed/link_graph.json";
    std::string output_path = "data/parsed/pagerank_scores.json";

    if (argc >= 2) input_path = argv[1];
    if (argc >= 3) output_path = argv[2];

    int num_nodes = 0;
    std::vector<Edge> edges;
    if (!parse_link_graph(input_path, num_nodes, edges)) {
        std::cerr << "[-] Failed to parse link graph." << std::endl;
        return 1;
    }

    std::cout << "[*] Loaded link graph with " << num_nodes << " nodes and " << edges.size() << " edges." << std::endl;

    GraphEngine engine(num_nodes);
    for (const auto& e : edges) {
        engine.add_edge(e.src, e.target);
    }

    // 1. Calculate PageRank
    std::vector<double> pr_scores = engine.compute_pagerank(0.85, 1e-7, 100);

    // 2. Calculate TrustRank (first initial seed nodes treated as verified trusted roots)
    std::vector<int> trusted_seeds;
    int seed_count = std::min(num_nodes, 10);
    for (int i = 0; i < seed_count; ++i) {
        trusted_seeds.push_back(i);
    }
    std::vector<double> tr_scores = engine.compute_trustrank(trusted_seeds, 0.85, 1e-7, 100);

    // Normalize PageRank
    double max_pr = 0.0, min_pr = 1.0;
    for (double s : pr_scores) {
        if (s > max_pr) max_pr = s;
        if (s < min_pr) min_pr = s;
    }

    // Normalize TrustRank
    double max_tr = 0.0, min_tr = 1.0;
    for (double s : tr_scores) {
        if (s > max_tr) max_tr = s;
        if (s < min_tr) min_tr = s;
    }

    std::ofstream out(output_path);
    out << "{\n";
    for (int i = 0; i < num_nodes; ++i) {
        double raw_pr = pr_scores[i];
        double norm_pr = (max_pr > min_pr) ? (raw_pr - min_pr) / (max_pr - min_pr) : 0.5;

        double raw_tr = tr_scores[i];
        double norm_tr = (max_tr > min_tr) ? (raw_tr - min_tr) / (max_tr - min_tr) : 0.5;

        // Anti-spam multiplier: if PageRank is high but TrustRank is low, reduce weight
        double trust_penalty = std::min(1.0, (norm_tr + 0.1) / (norm_pr + 0.1));

        out << "  \"" << i << "\": {\"raw\": " << std::setprecision(8) << raw_pr
            << ", \"normalized\": " << std::setprecision(6) << norm_pr
            << ", \"trustrank\": " << std::setprecision(6) << norm_tr
            << ", \"trust_multiplier\": " << std::setprecision(4) << trust_penalty << "}";
        if (i < num_nodes - 1) out << ",";
        out << "\n";
    }
    out << "}\n";
    out.close();

    std::cout << "[✓] PageRank & TrustRank scores generated and saved to: " << output_path << std::endl;
    return 0;
}
