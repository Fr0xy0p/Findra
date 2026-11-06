/**
 * PageRank Engine in C++20.
 * High-performance sparse matrix power iteration over directed link graphs.
 * Handles dangling nodes, uniform teleportation, damping factor d=0.85,
 * and convergence tracking via L1-norm residual.
 */

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <chrono>

struct Edge {
    int src;
    int target;
};

class PageRankEngine {
private:
    int num_nodes;
    std::vector<int> out_degree;
    std::vector<std::vector<int>> in_links; // incoming edges for each node
    std::vector<int> dangling_nodes;        // nodes with 0 out-degree

public:
    PageRankEngine(int n) : num_nodes(n), out_degree(n, 0), in_links(n) {}

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

    std::vector<double> compute(double damping = 0.85, double epsilon = 1e-7, int max_iter = 100) {
        finalize_graph();
        if (num_nodes == 0) return {};

        std::vector<double> pr(num_nodes, 1.0 / num_nodes);
        std::vector<double> pr_next(num_nodes, 0.0);

        std::cout << "[*] Running PageRank with N=" << num_nodes 
                  << ", damping=" << damping 
                  << ", dangling_nodes=" << dangling_nodes.size() << std::endl;

        auto start_time = std::chrono::high_resolution_clock::now();

        for (int iter = 1; iter <= max_iter; ++iter) {
            // Compute mass contributed by dangling nodes
            double dangling_mass = 0.0;
            for (int dangling_idx : dangling_nodes) {
                dangling_mass += pr[dangling_idx];
            }

            double base_value = (1.0 - damping) / num_nodes + (damping * dangling_mass) / num_nodes;

            // Power iteration step
            for (int i = 0; i < num_nodes; ++i) {
                double rank_sum = 0.0;
                for (int incoming_node : in_links[i]) {
                    rank_sum += pr[incoming_node] / out_degree[incoming_node];
                }
                pr_next[i] = base_value + damping * rank_sum;
            }

            // Calculate L1 residual: sum(|pr_next - pr|)
            double l1_diff = 0.0;
            for (int i = 0; i < num_nodes; ++i) {
                l1_diff += std::abs(pr_next[i] - pr[i]);
                pr[i] = pr_next[i];
            }

            if (iter % 10 == 0 || l1_diff < epsilon || iter == 1) {
                std::cout << "    Iteration " << std::setw(3) << iter 
                          << " | L1 residual = " << std::scientific << std::setprecision(6) << l1_diff << std::endl;
            }

            if (l1_diff < epsilon) {
                auto end_time = std::chrono::high_resolution_clock::now();
                auto duration_ms = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count() / 1000.0;
                std::cout << "[✓] Converged in " << iter << " iterations (" << duration_ms << " ms)!" << std::endl;
                break;
            }
        }

        return pr;
    }
};

// Simple JSON parser for the link_graph.json format
bool parse_link_graph(const std::string& filepath, int& num_nodes, std::vector<Edge>& edges) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "[-] Error opening graph file: " << filepath << std::endl;
        return false;
    }

    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    file.close();

    // Parse "num_nodes": N
    size_t node_pos = content.find("\"num_nodes\":");
    if (node_pos == std::string::npos) return false;
    size_t colon_pos = content.find(":", node_pos);
    size_t comma_pos = content.find(",", colon_pos);
    num_nodes = std::stoi(content.substr(colon_pos + 1, comma_pos - colon_pos - 1));

    // Parse "edges": [[s1, t1], [s2, t2], ...]
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

    std::cout << "[*] Loaded graph with " << num_nodes << " nodes and " << edges.size() << " edges." << std::endl;

    PageRankEngine engine(num_nodes);
    for (const auto& e : edges) {
        engine.add_edge(e.src, e.target);
    }

    std::vector<double> scores = engine.compute(0.85, 1e-7, 100);

    // Find min and max for normalization
    double max_score = 0.0;
    double min_score = 1.0;
    for (double s : scores) {
        if (s > max_score) max_score = s;
        if (s < min_score) min_score = s;
    }

    // Write output JSON
    std::ofstream out(output_path);
    out << "{\n";
    for (int i = 0; i < num_nodes; ++i) {
        double raw = scores[i];
        // Normalized score in [0.0, 1.0]
        double norm = (max_score > min_score) ? (raw - min_score) / (max_score - min_score) : 0.5;
        out << "  \"" << i << "\": {\"raw\": " << std::setprecision(10) << raw 
            << ", \"normalized\": " << std::setprecision(6) << norm << "}";
        if (i < num_nodes - 1) out << ",";
        out << "\n";
    }
    out << "}\n";
    out.close();

    std::cout << "[✓] PageRank scores written to: " << output_path << std::endl;
    return 0;
}

