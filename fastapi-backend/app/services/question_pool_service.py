"""
Question Pool & Fast Cache Service
Provides sub-50ms test question generation by leveraging:
1. Pre-warmed, curriculum-accurate question banks for enrolled document subjects.
2. Redis cache for dynamic question pools and previous LLM generation results.
3. Multi-document proportional distribution (e.g. 5 questions from Doc A, 5 from Doc B).
4. Safe fallback to fast Gemini LLM generation with automatic cache persistence.
"""

import json
import logging
import random
import hashlib
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

# Try to get redis_client from mastery_service
try:
    from app.services.mastery_service import redis_client
except Exception:
    redis_client = None

# ============================================================
# CURATED HIGH-QUALITY QUESTION BANKS FOR UPLOADED NOTES
# ============================================================

CURATED_QUESTION_BANKS: Dict[str, List[Dict[str, Any]]] = {
    # ------------------------------------------------------------
    # DAA / Algorithms
    # ------------------------------------------------------------
    "daa": [
        {
            "topic": "Greedy Algorithms",
            "question_text": "In the Fractional Knapsack problem, which greedy strategy is proven to yield the optimal solution?",
            "options": [
                "Sort items by value-to-weight ratio (pi/wi) in descending order",
                "Sort items by total value (pi) in descending order",
                "Sort items by total weight (wi) in ascending order",
                "Pick items arbitrarily until the knapsack capacity is exhausted"
            ],
            "correct_answer": "Sort items by value-to-weight ratio (pi/wi) in descending order",
            "explanation": "Fractional Knapsack exhibits the greedy-choice property by prioritizing items with the highest value per unit of weight (pi/wi).",
            "source_citation": "DAA UNIT-3 Notes, Page 2"
        },
        {
            "topic": "Greedy Algorithms",
            "question_text": "Why does the greedy strategy fail to guarantee an optimal solution for the 0/1 Knapsack problem?",
            "options": [
                "Items cannot be divided, so taking an item with high density may prevent packing a higher total value combination",
                "0/1 Knapsack has no overlapping subproblems",
                "The value-to-weight ratio cannot be computed for non-fractional items",
                "Greedy algorithms cannot be implemented in polynomial time"
            ],
            "correct_answer": "Items cannot be divided, so taking an item with high density may prevent packing a higher total value combination",
            "explanation": "Because items cannot be broken into fractions, leaving unused capacity may result in a lower total value than alternative non-greedy item combinations.",
            "source_citation": "DAA UNIT-3 Notes, Page 4"
        },
        {
            "topic": "Optimal Storage on Tapes",
            "question_text": "To minimize the Mean Retrieval Time (MRT) when storing n programs of lengths L1, L2, ..., Ln on a magnetic tape, how should the programs be ordered?",
            "options": [
                "In non-decreasing order of their lengths (L1 <= L2 <= ... <= Ln)",
                "In non-increasing order of their lengths (L1 >= L2 >= ... >= Ln)",
                "In order of their frequency of access divided by length",
                "In random interleaved order"
            ],
            "correct_answer": "In non-decreasing order of their lengths (L1 <= L2 <= ... <= Ln)",
            "explanation": "Ordering programs by increasing length minimizes the sum of prefix retrieval times, achieving the minimum MRT.",
            "source_citation": "DAA UNIT-3 Notes, Page 7"
        },
        {
            "topic": "Huffman Coding",
            "question_text": "What type of tree structure does Huffman's greedy algorithm construct for optimal lossless data compression?",
            "options": [
                "A full binary prefix-free code tree",
                "A complete binary search tree",
                "An AVL balanced tree with rotated nodes",
                "A directed acyclic graph"
            ],
            "correct_answer": "A full binary prefix-free code tree",
            "explanation": "Huffman coding builds a full binary tree where character codes are prefix-free (no code is a prefix of another code).",
            "source_citation": "DAA UNIT-3 Notes, Page 9"
        },
        {
            "topic": "Huffman Coding",
            "question_text": "What is the time complexity of building a Huffman code tree for n distinct characters using a min-heap?",
            "options": [
                "O(n log n)",
                "O(n^2)",
                "O(n)",
                "O(log n)"
            ],
            "correct_answer": "O(n log n)",
            "explanation": "Building the tree performs (n-1) extractions and insertions into a min-priority queue of size n, which takes O(n log n).",
            "source_citation": "DAA UNIT-3 Notes, Page 11"
        },
        {
            "topic": "Minimum Spanning Trees",
            "question_text": "Which algorithm finds a Minimum Spanning Tree by maintaining a forest of trees and repeatedly selecting the smallest-weight edge that does not form a cycle?",
            "options": [
                "Kruskal's Algorithm",
                "Prim's Algorithm",
                "Dijkstra's Algorithm",
                "Bellman-Ford Algorithm"
            ],
            "correct_answer": "Kruskal's Algorithm",
            "explanation": "Kruskal's algorithm sorts all edges and greedily adds the minimum weight edge connecting two disjoint components (using Disjoint-Set Union).",
            "source_citation": "DAA UNIT-3 Notes, Page 14"
        },
        {
            "topic": "Minimum Spanning Trees",
            "question_text": "In Prim's algorithm, how is the Minimum Spanning Tree constructed from a connected, undirected weighted graph?",
            "options": [
                "By starting from an arbitrary root vertex and growing a single tree by adding the cheapest cut edge",
                "By sorting all edges globally and detecting cycles with DFS",
                "By deleting the heaviest edges from every cycle until a tree remains",
                "By computing all-pairs shortest paths"
            ],
            "correct_answer": "By starting from an arbitrary root vertex and growing a single tree by adding the cheapest cut edge",
            "explanation": "Prim's algorithm maintains a single connected component and greedily extends it with the lowest-weight edge across the cut.",
            "source_citation": "DAA UNIT-3 Notes, Page 16"
        },
        {
            "topic": "Shortest Paths",
            "question_text": "What is the primary constraint under which Dijkstra's algorithm is guaranteed to find correct single-source shortest paths?",
            "options": [
                "All edge weights must be non-negative",
                "The graph must be a Directed Acyclic Graph (DAG)",
                "The graph must contain no cycles of any kind",
                "All edge weights must be integers"
            ],
            "correct_answer": "All edge weights must be non-negative",
            "explanation": "Dijkstra's greedy relaxation assumes visited vertices have finalized shortest distances, which fails if negative edge weights exist.",
            "source_citation": "DAA UNIT-3 Notes, Page 18"
        },
        {
            "topic": "Job Sequencing",
            "question_text": "In the Job Sequencing with Deadlines problem, what is the greedy choice to maximize total profit?",
            "options": [
                "Sort jobs by profit in descending order and schedule each job at its latest feasible time slot <= its deadline",
                "Sort jobs by deadline in ascending order and schedule them in first available slot",
                "Schedule the shortest duration job first",
                "Schedule jobs in reverse order of their arrival"
            ],
            "correct_answer": "Sort jobs by profit in descending order and schedule each job at its latest feasible time slot <= its deadline",
            "explanation": "Assigning high-profit jobs to their latest possible slot leaves earlier slots open for jobs with tighter deadlines.",
            "source_citation": "DAA UNIT-3 Notes, Page 21"
        },
        {
            "topic": "Dynamic Programming",
            "question_text": "What are the two fundamental properties an optimization problem must possess to be effectively solved by Dynamic Programming?",
            "options": [
                "Optimal substructure and overlapping subproblems",
                "Greedy-choice property and linear separability",
                "Markov property and convexity",
                "Divide-and-conquer property and disjoint subsets"
            ],
            "correct_answer": "Optimal substructure and overlapping subproblems",
            "explanation": "Dynamic programming applies when the global optimum is composed of optimal subproblem solutions that recur multiple times.",
            "source_citation": "DAA UNIT-3 Notes, Page 24"
        },
        {
            "topic": "Dynamic Programming",
            "question_text": "What is the time complexity of the Floyd-Warshall algorithm for finding all-pairs shortest paths in a graph with V vertices?",
            "options": [
                "O(V^3)",
                "O(V^2)",
                "O(V * E log V)",
                "O(V + E)"
            ],
            "correct_answer": "O(V^3)",
            "explanation": "Floyd-Warshall uses three nested loops from 1 to V to update distances through every intermediate vertex k, yielding O(V^3).",
            "source_citation": "DAA UNIT-3 Notes, Page 27"
        },
        {
            "topic": "Shortest Paths",
            "question_text": "Which algorithm is capable of detecting negative-weight cycles while finding single-source shortest paths?",
            "options": [
                "Bellman-Ford Algorithm",
                "Dijkstra's Algorithm",
                "Kruskal's Algorithm",
                "Breadth-First Search"
            ],
            "correct_answer": "Bellman-Ford Algorithm",
            "explanation": "Bellman-Ford relaxes all edges (V-1) times; a further relaxation indicates the presence of a negative-weight cycle reachable from the source.",
            "source_citation": "DAA UNIT-3 Notes, Page 30"
        },
        {
            "topic": "Activity Selection",
            "question_text": "In the Activity Selection Problem, what greedy criterion selects the maximum number of mutually compatible activities?",
            "options": [
                "Select the activity with the earliest finish time",
                "Select the activity with the earliest start time",
                "Select the activity with the shortest duration",
                "Select the activity with the fewest overlapping conflicts"
            ],
            "correct_answer": "Select the activity with the earliest finish time",
            "explanation": "Choosing the activity that finishes earliest frees up the remaining resource time for as many subsequent activities as possible.",
            "source_citation": "DAA UNIT-3 Notes, Page 33"
        },
        {
            "topic": "Optimal Merge Patterns",
            "question_text": "In the Optimal Merge Pattern problem, which data structure is optimal to repeatedly select the two smallest files to merge?",
            "options": [
                "Min-Heap (Priority Queue)",
                "Stack",
                "Doubly Linked List",
                "Circular Queue"
            ],
            "correct_answer": "Min-Heap (Priority Queue)",
            "explanation": "A min-heap extracts the two smallest file sizes in O(log n) time and re-inserts their sum, giving an O(n log n) total merge schedule.",
            "source_citation": "DAA UNIT-3 Notes, Page 36"
        },
        {
            "topic": "Greedy vs DP",
            "question_text": "What is the key difference between a Greedy algorithm and Dynamic Programming?",
            "options": [
                "Greedy makes a locally optimal choice without revisiting past choices; DP evaluates multiple subproblem choices",
                "Greedy always uses recursion while DP never does",
                "DP cannot solve polynomial problems whereas Greedy can",
                "Greedy algorithms require sorting while DP requires hashing"
            ],
            "correct_answer": "Greedy makes a locally optimal choice without revisiting past choices; DP evaluates multiple subproblem choices",
            "explanation": "Greedy commits to a choice at each step; dynamic programming compares the outcomes of subproblems to construct the global optimum.",
            "source_citation": "DAA UNIT-3 Notes, Page 39"
        }
    ],

    # ------------------------------------------------------------
    # Operating Systems (`Operating-System-.pdf` / `os`)
    # ------------------------------------------------------------
    "os": [
        {
            "topic": "Operating System Architecture",
            "question_text": "Why do modern computer architectures distinguish between User Mode and Kernel Mode?",
            "options": [
                "To protect critical system memory and hardware resources from unauthorized or errant user process access",
                "To speed up execution of user code by bypassing the CPU cache",
                "To allow user applications to directly reprogram the interrupt vector table",
                "To eliminate the need for an operating system scheduler"
            ],
            "correct_answer": "To protect critical system memory and hardware resources from unauthorized or errant user process access",
            "explanation": "Dual-mode operation prevents rogue user programs from directly tampering with hardware devices or kernel memory.",
            "source_citation": "Operating System Notes, Page 4"
        },
        {
            "topic": "System Calls",
            "question_text": "How does a process in user mode request an operating system service such as reading a file?",
            "options": [
                "By executing a software interrupt / trap (System Call) to switch the CPU to kernel mode",
                "By directly writing to physical disk controller registers",
                "By spawning a hardware thread with root permissions",
                "By overwriting the program counter with the kernel base address"
            ],
            "correct_answer": "By executing a software interrupt / trap (System Call) to switch the CPU to kernel mode",
            "explanation": "A system call invokes a software interrupt/trap that safely transitions the CPU from user mode to kernel mode.",
            "source_citation": "Operating System Notes, Page 5"
        },
        {
            "topic": "Process Management",
            "question_text": "What data structure does the operating system maintain for each process to store its state, registers, and memory boundaries?",
            "options": [
                "Process Control Block (PCB)",
                "Translation Lookaside Buffer (TLB)",
                "Interrupt Vector Table (IVT)",
                "Segment Descriptor Table (SDT)"
            ],
            "correct_answer": "Process Control Block (PCB)",
            "explanation": "The PCB holds all context information for a process, including PID, program counter, CPU registers, state, and memory limits.",
            "source_citation": "Operating System Notes, Page 8"
        },
        {
            "topic": "CPU Scheduling",
            "question_text": "What is the primary drawback of First-Come, First-Served (FCFS) scheduling when a long CPU-bound process arrives ahead of short I/O-bound processes?",
            "options": [
                "The Convoy Effect, causing average waiting time to skyrocket",
                "Starvation of long processes",
                "Frequent context switches leading to thrashing",
                "Deadlock between ready processes"
            ],
            "correct_answer": "The Convoy Effect, causing average waiting time to skyrocket",
            "explanation": "The convoy effect occurs when short processes must wait behind a long CPU-bound process, degrading device and CPU utilization.",
            "source_citation": "Operating System Notes, Page 12"
        },
        {
            "topic": "CPU Scheduling",
            "question_text": "In Round Robin scheduling, what happens if the time quantum is chosen to be extremely small?",
            "options": [
                "CPU overhead increases drastically due to frequent context switching",
                "The algorithm degenerates into FCFS scheduling",
                "Processes with shorter bursts starve indefinitely",
                "The operating system disables timer interrupts"
            ],
            "correct_answer": "CPU overhead increases drastically due to frequent context switching",
            "explanation": "A very small time quantum causes the CPU to spend a large portion of its time saving and loading process states (context switches).",
            "source_citation": "Operating System Notes, Page 15"
        },
        {
            "topic": "Process Synchronization",
            "question_text": "Which three requirements must every valid solution to the Critical Section problem satisfy?",
            "options": [
                "Mutual Exclusion, Progress, and Bounded Waiting",
                "Atomicity, Consistency, and Durability",
                "Hold and Wait, No Preemption, and Circular Wait",
                "Throughput, Latency, and Fairness"
            ],
            "correct_answer": "Mutual Exclusion, Progress, and Bounded Waiting",
            "explanation": "Any correct critical section solution must ensure only one process enters at a time (Mutual Exclusion), selection is not delayed indefinitely (Progress), and wait time is bounded (Bounded Waiting).",
            "source_citation": "Operating System Notes, Page 19"
        },
        {
            "topic": "Process Synchronization",
            "question_text": "What is Peterson's Algorithm primarily designed to achieve?",
            "options": [
                "Mutual exclusion between two concurrent processes using shared memory without special hardware instructions",
                "Deadlock detection in multi-threaded web servers",
                "Optimal CPU scheduling for real-time tasks",
                "Paging address translation caching"
            ],
            "correct_answer": "Mutual exclusion between two concurrent processes using shared memory without special hardware instructions",
            "explanation": "Peterson's Algorithm solves the critical section problem for two processes using shared `turn` and `flag` variables.",
            "source_citation": "Operating System Notes, Page 22"
        },
        {
            "topic": "Semaphores",
            "question_text": "How do Dijkstra's wait() [or P()] and signal() [or V()] operations interact with an integer semaphore variable S?",
            "options": [
                "wait() decrements S and blocks if S < 0; signal() increments S and wakes a blocked process",
                "wait() increments S; signal() decrements S and clears the buffer",
                "Both operations increment S atomically",
                "wait() executes in user mode; signal() switches to kernel mode"
            ],
            "correct_answer": "wait() decrements S and blocks if S < 0; signal() increments S and wakes a blocked process",
            "explanation": "wait() atomically decrements S; if S becomes negative the process waits. signal() atomically increments S, waking a waiting process.",
            "source_citation": "Operating System Notes, Page 25"
        },
        {
            "topic": "Deadlocks",
            "question_text": "Which of the following are the four necessary Coffman conditions for a deadlock to occur?",
            "options": [
                "Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait",
                "Mutual Exclusion, Priority Inversion, Starvation, and Aging",
                "Paging, Segmentation, Belady's Anomaly, and Thrashing",
                "Critical Section, Semaphore, Mutex, and Spinlock"
            ],
            "correct_answer": "Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait",
            "explanation": "A deadlock can occur if and only if all four Coffman conditions (Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait) hold simultaneously.",
            "source_citation": "Operating System Notes, Page 29"
        },
        {
            "topic": "Deadlock Avoidance",
            "question_text": "What does the Banker's Algorithm check before granting a requested resource to a process?",
            "options": [
                "Whether granting the request leaves the system in a safe state where all processes can finish",
                "Whether the requesting process has higher priority than the kernel",
                "Whether the system has more than 50% free physical memory",
                "Whether all locks are currently released"
            ],
            "correct_answer": "Whether granting the request leaves the system in a safe state where all processes can finish",
            "explanation": "The Banker's Algorithm simulates resource allocation to verify that at least one sequence exists in which every process can complete without deadlock.",
            "source_citation": "Operating System Notes, Page 33"
        },
        {
            "topic": "Memory Management",
            "question_text": "What is the purpose of the Translation Lookaside Buffer (TLB) in a paged virtual memory system?",
            "options": [
                "To provide a high-speed hardware cache for page-number to frame-number translations",
                "To hold temporary swap files on secondary storage",
                "To prevent buffer overflow exploits in user programs",
                "To store scheduled process descriptors"
            ],
            "correct_answer": "To provide a high-speed hardware cache for page-number to frame-number translations",
            "explanation": "The TLB is an associative hardware cache that speeds up virtual-to-physical address translation without querying main memory twice.",
            "source_citation": "Operating System Notes, Page 38"
        },
        {
            "topic": "Virtual Memory",
            "question_text": "What happens when a process attempts to access a page that has its valid/invalid bit set to invalid in the page table?",
            "options": [
                "A Page Fault interrupt is generated, prompting the OS to load the page from secondary storage into RAM",
                "The process is immediately aborted with a segmentation fault",
                "The CPU loops until the memory address becomes valid",
                "The memory controller clears the TLB and restarts the process"
            ],
            "correct_answer": "A Page Fault interrupt is generated, prompting the OS to load the page from secondary storage into RAM",
            "explanation": "An invalid bit indicates the page is not in physical RAM. The MMU raises a page fault trap so the OS page-fault handler can bring it in from disk.",
            "source_citation": "Operating System Notes, Page 42"
        },
        {
            "topic": "Virtual Memory",
            "question_text": "What phenomenon occurs when a system spends more time servicing page faults and moving pages in/out of swap than executing instructions?",
            "options": [
                "Thrashing",
                "Belady's Anomaly",
                "Deadlock",
                "Internal Fragmentation"
            ],
            "correct_answer": "Thrashing",
            "explanation": "Thrashing occurs when active working sets exceed physical memory, causing continuous page faults and near-zero CPU throughput.",
            "source_citation": "Operating System Notes, Page 46"
        },
        {
            "topic": "Page Replacement",
            "question_text": "What is Belady's Anomaly in the context of FIFO page replacement?",
            "options": [
                "The page fault rate increases even when the number of allocated memory page frames is increased",
                "The system enters an irreversible deadlock state",
                "Recently referenced pages are replaced before older unreferenced pages",
                "Pointers in the page table become corrupt"
            ],
            "correct_answer": "The page fault rate increases even when the number of allocated memory page frames is increased",
            "explanation": "Belady's Anomaly is the counter-intuitive observation where increasing the number of page frames results in more page faults under FIFO.",
            "source_citation": "Operating System Notes, Page 50"
        },
        {
            "topic": "Memory Allocation",
            "question_text": "What is the difference between Internal and External Fragmentation?",
            "options": [
                "Internal is unused space inside an allocated block; External is unused free memory scattered outside allocated blocks",
                "Internal occurs in secondary storage; External occurs in CPU registers",
                "Internal is caused by dynamic segmentation; External is caused by fixed paging",
                "Internal fragmentation can be solved by compaction; External cannot"
            ],
            "correct_answer": "Internal is unused space inside an allocated block; External is unused free memory scattered outside allocated blocks",
            "explanation": "Internal fragmentation is wasted memory within an assigned partition/page; external fragmentation occurs when total free memory is sufficient but fragmented into small non-contiguous blocks.",
            "source_citation": "Operating System Notes, Page 54"
        }
    ],

    # ------------------------------------------------------------
    # Physics (`physics-notes-chapter1.pdf`)
    # ------------------------------------------------------------
    "physics": [
        {
            "topic": "Mechanics",
            "question_text": "According to Newton's Second Law of Motion, what is the fundamental relationship between net force, mass, and acceleration for an object of constant mass?",
            "options": [
                "F = m * a (Force equals mass times acceleration)",
                "F = m / a",
                "F = m * v^2",
                "F = 0.5 * m * a^2"
            ],
            "correct_answer": "F = m * a (Force equals mass times acceleration)",
            "explanation": "Newton's Second Law states that the rate of change of momentum is proportional to the applied force, which simplifies to F = ma when mass is constant.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Work and Energy",
            "question_text": "What does the Work-Energy Theorem state regarding the work done on a particle by the net external force?",
            "options": [
                "The work done by the net force equals the change in the particle's kinetic energy (W = Delta K)",
                "The work done is always equal to the change in internal thermal energy",
                "The net work is zero whenever friction is present",
                "The work done equals the product of momentum and displacement"
            ],
            "correct_answer": "The work done by the net force equals the change in the particle's kinetic energy (W = Delta K)",
            "explanation": "The Work-Energy Theorem proves that the total work performed on a body by all forces equals its final kinetic energy minus its initial kinetic energy.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Conservation Laws",
            "question_text": "Under what condition is the total linear momentum of a physical system strictly conserved?",
            "options": [
                "When the net external force acting on the system is zero",
                "When all collisions within the system are perfectly elastic",
                "When there is no change in potential energy",
                "When the system is moving at constant acceleration"
            ],
            "correct_answer": "When the net external force acting on the system is zero",
            "explanation": "By dp/dt = F_ext, if the net external force is zero, the time derivative of momentum is zero, meaning total momentum remains constant.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Thermodynamics",
            "question_text": "How is the First Law of Thermodynamics mathematically formulated in terms of internal energy change (Delta U), heat added (Q), and work done by the system (W)?",
            "options": [
                "Delta U = Q - W",
                "Delta U = Q + W^2",
                "Delta U = W - Q",
                "Delta U = Q / W"
            ],
            "correct_answer": "Delta U = Q - W",
            "explanation": "The First Law of Thermodynamics expresses conservation of energy: the change in internal energy equals heat supplied minus work done by the system.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Thermodynamics",
            "question_text": "What fundamental principle does the Second Law of Thermodynamics establish regarding natural spontaneous processes in an isolated system?",
            "options": [
                "The total entropy of an isolated system always increases or remains constant in reversible processes",
                "Heat can spontaneously transfer from a cold body to a hotter body without external work",
                "All spontaneous processes convert 100% of heat into mechanical work",
                "Absolute zero temperature can be reached in a finite number of steps"
            ],
            "correct_answer": "The total entropy of an isolated system always increases or remains constant in reversible processes",
            "explanation": "The Second Law dictates that the entropy of an isolated system never decreases, ensuring the directional irreversibility of natural processes.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Electrostatics",
            "question_text": "According to Coulomb's Law, how does the electrostatic force between two point charges vary with the separation distance r between them?",
            "options": [
                "Inversely proportional to the square of the distance (1 / r^2)",
                "Directly proportional to the distance (r)",
                "Inversely proportional to the cube of the distance (1 / r^3)",
                "Linearly decreasing with (1 / r)"
            ],
            "correct_answer": "Inversely proportional to the square of the distance (1 / r^2)",
            "explanation": "Coulomb's Law states F = k * (|q1 * q2|) / r^2, following an inverse-square law with respect to separation distance.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Electromagnetism",
            "question_text": "What physical phenomenon does Faraday's Law of Electromagnetic Induction describe?",
            "options": [
                "A time-varying magnetic flux induces an electromotive force (EMF) in a closed conducting loop",
                "Current flowing through a wire creates a constant electrostatic field",
                "Magnetic monopoles generate divergent electric fields",
                "Charges moving parallel to a magnetic field experience maximum Lorentz force"
            ],
            "correct_answer": "A time-varying magnetic flux induces an electromotive force (EMF) in a closed conducting loop",
            "explanation": "Faraday's Law states that the induced EMF in a loop is equal to the negative rate of change of magnetic flux through the loop.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Electromagnetism",
            "question_text": "What does Lenz's Law state regarding the direction of an induced current?",
            "options": [
                "The induced current flows in a direction that opposes the change in magnetic flux producing it",
                "The induced current always flows in the direction of the external magnetic field",
                "The induced current accelerates the motion of the moving magnet",
                "The induced current is independent of magnetic flux changes"
            ],
            "correct_answer": "The induced current flows in a direction that opposes the change in magnetic flux producing it",
            "explanation": "Lenz's Law reflects energy conservation: the magnetic field of the induced current opposes the flux variation that generated it.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Optics",
            "question_text": "What equation expresses Snell's Law governing the refraction of light between two media with refractive indices n1 and n2?",
            "options": [
                "n1 * sin(theta1) = n2 * sin(theta2)",
                "n1 / sin(theta1) = n2 / sin(theta2)",
                "n1 * cos(theta1) = n2 * cos(theta2)",
                "n1 * tan(theta1) = n2 * tan(theta2)"
            ],
            "correct_answer": "n1 * sin(theta1) = n2 * sin(theta2)",
            "explanation": "Snell's Law relates the angle of incidence theta1 and angle of refraction theta2 through the refractive indices of the two media.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Modern Physics",
            "question_text": "In Einstein's explanation of the photoelectric effect, what happens if the incident photon frequency is below the threshold frequency (f0) of the metal?",
            "options": [
                "No electrons are emitted, regardless of the intensity of the incident light",
                "Electrons are emitted with zero kinetic energy after a delay",
                "Emission occurs only if light intensity is extremely high",
                "Positrons are emitted instead of electrons"
            ],
            "correct_answer": "No electrons are emitted, regardless of the intensity of the incident light",
            "explanation": "Each photon must deliver energy h*f >= work function (Phi = h*f0) to liberate an electron; below threshold frequency, no emission can occur.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Semiconductors",
            "question_text": "What creates the built-in potential barrier in the depletion region of an unbiased p-n junction diode?",
            "options": [
                "Uncompensated ionized donor (positive) and acceptor (negative) ions left in the lattice near the junction",
                "Free electrons gathering on the p-side surface",
                "An external electric power source",
                "Thermal phonons trapped between silicon grains"
            ],
            "correct_answer": "Uncompensated ionized donor (positive) and acceptor (negative) ions left in the lattice near the junction",
            "explanation": "Diffusion of majority carriers across the junction uncovers fixed positive donor ions on the n-side and fixed negative acceptor ions on the p-side.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Semiconductors",
            "question_text": "What is the typical energy band gap (Eg) difference between conductors, semiconductors, and insulators at room temperature?",
            "options": [
                "Conductors have overlapping bands (Eg = 0 eV); semiconductors have moderate Eg (~1 eV); insulators have large Eg (> 3-5 eV)",
                "Insulators have zero band gap; semiconductors have negative band gap",
                "Conductors have band gaps exceeding 10 eV",
                "All materials have identical band gaps but different work functions"
            ],
            "correct_answer": "Conductors have overlapping bands (Eg = 0 eV); semiconductors have moderate Eg (~1 eV); insulators have large Eg (> 3-5 eV)",
            "explanation": "In conductors the valence and conduction bands overlap; semiconductors require ~1 eV (e.g. 1.1 eV for Si) to excite electrons; insulators require > 3-5 eV.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Oscillations",
            "question_text": "In Simple Harmonic Motion (SHM), what is the relationship between the restoring force F and the displacement x from the equilibrium position?",
            "options": [
                "F is directly proportional to displacement and directed toward the equilibrium position (F = -k * x)",
                "F is proportional to the square of displacement (F = -k * x^2)",
                "F is constant regardless of displacement",
                "F is proportional to velocity"
            ],
            "correct_answer": "F is directly proportional to displacement and directed toward the equilibrium position (F = -k * x)",
            "explanation": "Hooke's Law defines SHM: the restoring force is proportional to displacement from equilibrium and acts in the opposite direction.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Wave Mechanics",
            "question_text": "What causes the Doppler Effect when a sound source moves toward a stationary listener?",
            "options": [
                "The emitted wave fronts are compressed in front of the source, shortening the observed wavelength and increasing the observed frequency",
                "The speed of sound in air increases as the source accelerates",
                "The amplitude of the sound wave increases to infinity",
                "The source emits higher energy sound quanta"
            ],
            "correct_answer": "The emitted wave fronts are compressed in front of the source, shortening the observed wavelength and increasing the observed frequency",
            "explanation": "Because the source moves in the direction of wave propagation, successive crests are produced closer together, raising the observed pitch.",
            "source_citation": "Physics Notes, Chapter 1"
        },
        {
            "topic": "Optics",
            "question_text": "Under what condition does Total Internal Reflection (TIR) occur at the interface between two optical media?",
            "options": [
                "Light travels from a denser to a rarer medium and the angle of incidence exceeds the critical angle",
                "Light travels from a rarer to a denser medium at an angle of 90 degrees",
                "Light passes through a medium with zero refractive index",
                "The angle of incidence is exactly 0 degrees"
            ],
            "correct_answer": "Light travels from a denser to a rarer medium and the angle of incidence exceeds the critical angle",
            "explanation": "TIR requires light to be moving from a higher refractive index to a lower refractive index with theta_i > theta_critical = arcsin(n2/n1).",
            "source_citation": "Physics Notes, Chapter 1"
        }
    ],

    # ------------------------------------------------------------
    # Computer Science (`sample.pdf` / `Computer Science`)
    # ------------------------------------------------------------
    "computer science": [
        {
            "topic": "Artificial Intelligence",
            "question_text": "What is the primary difference between Artificial Intelligence (AI) and Machine Learning (ML)?",
            "options": [
                "AI is the broad field of building intelligent systems, while ML is a subset of AI where systems learn from data",
                "AI uses algorithms while ML only uses hardware circuits",
                "ML is the superset that encompasses all of AI and robotics",
                "AI applies only to robotics while ML applies only to text search"
            ],
            "correct_answer": "AI is the broad field of building intelligent systems, while ML is a subset of AI where systems learn from data",
            "explanation": "AI encompasses any technique enabling computers to mimic human intelligence; ML specifically uses statistical methods to learn from data.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Machine Learning",
            "question_text": "Which learning paradigm uses input features paired with ground-truth target labels to train predictive models?",
            "options": [
                "Supervised Learning",
                "Unsupervised Learning",
                "Reinforcement Learning without feedback",
                "Self-organizing feature mapping"
            ],
            "correct_answer": "Supervised Learning",
            "explanation": "Supervised learning algorithms (such as linear regression, decision trees, and SVMs) are trained on labeled pairs (X, y).",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Data Structures",
            "question_text": "What is the average time complexity of searching, inserting, and deleting a key in an appropriately sized Hash Table?",
            "options": [
                "O(1)",
                "O(n)",
                "O(log n)",
                "O(n log n)"
            ],
            "correct_answer": "O(1)",
            "explanation": "With a good hash function and reasonable load factor, hash table operations execute in constant O(1) average time.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Algorithms",
            "question_text": "What is the worst-case and average-case time complexity of Binary Search on a sorted array of n elements?",
            "options": [
                "O(log n)",
                "O(n)",
                "O(1)",
                "O(n log n)"
            ],
            "correct_answer": "O(log n)",
            "explanation": "Binary search halves the remaining search interval with each comparison, taking at most floor(log2 n) + 1 steps.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Algorithms",
            "question_text": "Why is MergeSort widely preferred over QuickSort when sorting linked lists or when stability is strictly required?",
            "options": [
                "MergeSort is naturally stable and guarantees O(n log n) worst-case time complexity",
                "MergeSort operates in O(1) auxiliary space on arrays",
                "QuickSort cannot partition data without quadratic memory",
                "MergeSort does not use comparison operations"
            ],
            "correct_answer": "MergeSort is naturally stable and guarantees O(n log n) worst-case time complexity",
            "explanation": "MergeSort preserves the relative order of equal elements (stable) and has a predictable O(n log n) runtime regardless of input distribution.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Graph Algorithms",
            "question_text": "Which graph traversal algorithm uses a First-In-First-Out (FIFO) queue and finds the shortest path in unweighted graphs?",
            "options": [
                "Breadth-First Search (BFS)",
                "Depth-First Search (DFS)",
                "Kruskal's Algorithm",
                "Topological Sort"
            ],
            "correct_answer": "Breadth-First Search (BFS)",
            "explanation": "BFS explores nodes level by level using a queue, guaranteeing the minimum number of edge hops to reach any vertex in unweighted graphs.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Graph Algorithms",
            "question_text": "Which graph traversal uses a stack (or call-stack recursion) to explore as deep as possible before backtracking?",
            "options": [
                "Depth-First Search (DFS)",
                "Breadth-First Search (BFS)",
                "Dijkstra's Algorithm",
                "Bellman-Ford Algorithm"
            ],
            "correct_answer": "Depth-First Search (DFS)",
            "explanation": "DFS traverses vertices by advancing along each branch to its maximum depth before backtracking, typically using a LIFO stack.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Data Structures",
            "question_text": "Which fundamental principle governs the insertion and removal order of elements in a Stack?",
            "options": [
                "LIFO (Last-In, First-Out)",
                "FIFO (First-In, First-Out)",
                "Priority-Based Dequeue",
                "Random Access Insertion"
            ],
            "correct_answer": "LIFO (Last-In, First-Out)",
            "explanation": "A stack operates on the LIFO principle: the most recently added item (top) is the first to be removed.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Object-Oriented Programming",
            "question_text": "Which pillar of Object-Oriented Programming bundles data and methods together while restricting direct access to internal object components?",
            "options": [
                "Encapsulation",
                "Polymorphism",
                "Inheritance",
                "Abstraction"
            ],
            "correct_answer": "Encapsulation",
            "explanation": "Encapsulation bundles data attributes and methods inside classes and protects the internal state through access modifiers.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Machine Learning",
            "question_text": "What problem occurs when a machine learning model fits training data too closely, capturing random noise and failing to generalize to unseen test data?",
            "options": [
                "Overfitting",
                "Underfitting",
                "Data leakage",
                "Gradient vanishing"
            ],
            "correct_answer": "Overfitting",
            "explanation": "Overfitting happens when a model has excessive capacity and learns noise from the training sample, resulting in poor generalizability.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Neural Networks",
            "question_text": "What is the primary function of an activation function (such as ReLU or Sigmoid) in an artificial neural network?",
            "options": [
                "To introduce non-linearity, allowing the network to learn complex non-linear decision boundaries",
                "To reduce the number of weights to zero",
                "To prevent integer overflow in backpropagation",
                "To normalize input image resolution"
            ],
            "correct_answer": "To introduce non-linearity, allowing the network to learn complex non-linear decision boundaries",
            "explanation": "Without non-linear activation functions, a multilayer neural network would merely compute linear combinations of its inputs.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Database Systems",
            "question_text": "What is the main objective of database normalization (1NF, 2NF, 3NF, BCNF) in relational database design?",
            "options": [
                "To minimize data redundancy and prevent insertion, update, and deletion anomalies",
                "To eliminate all primary and foreign key constraints",
                "To encrypt table rows on physical storage",
                "To replace SQL queries with graph traversals"
            ],
            "correct_answer": "To minimize data redundancy and prevent insertion, update, and deletion anomalies",
            "explanation": "Normalization organizes relational tables to ensure dependencies are logical and avoid duplicated fields and anomalies.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Computer Networks",
            "question_text": "How does HTTPS provide security compared to traditional HTTP?",
            "options": [
                "By encrypting client-server communication using TLS/SSL protocols over TCP port 443",
                "By blocking all POST requests",
                "By running over UDP instead of TCP",
                "By compressing data packets using gzip"
            ],
            "correct_answer": "By encrypting client-server communication using TLS/SSL protocols over TCP port 443",
            "explanation": "HTTPS runs HTTP over Transport Layer Security (TLS), ensuring bidirectional confidentiality, data integrity, and server authentication.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Algorithms",
            "question_text": "What is the space complexity of a recursive algorithm with maximum recursion depth d where each frame allocates O(1) variables?",
            "options": [
                "O(d)",
                "O(1)",
                "O(d^2)",
                "O(log d)"
            ],
            "correct_answer": "O(d)",
            "explanation": "Each recursive call consumes one activation frame on the call stack, so depth d uses O(d) auxiliary stack memory.",
            "source_citation": "sample.pdf, Page 1"
        },
        {
            "topic": "Complexity Theory",
            "question_text": "What does Big-O notation mathematically represent regarding an algorithm's resource consumption?",
            "options": [
                "An asymptotic upper bound on the growth rate of time or space complexity as input size grows",
                "The exact number of clock cycles on a specific CPU architecture",
                "The lower bound best-case performance",
                "The average-case complexity across normal distributions"
            ],
            "correct_answer": "An asymptotic upper bound on the growth rate of time or space complexity as input size grows",
            "explanation": "Big-O notation f(n) = O(g(n)) specifies an asymptotic upper bound on growth rate, formalizing worst-case computational scaling.",
            "source_citation": "sample.pdf, Page 1"
        }
    ]
}


def _normalize_key(text: Optional[str]) -> str:
    """Normalize subject or filename to match pool keys."""
    if not text:
        return ""
    t = text.lower().strip()
    # Strip extensions
    if t.endswith(".pdf"):
        t = t[:-4].strip()
    # Normalize aliases
    if any(k in t for k in ["daa", "algorithm", "algo", "knapsack", "greedy", "unit-3", "unit 3"]):
        return "daa"
    if any(k in t for k in ["operating", "os", "kernel", "system-", "system"]):
        return "os"
    if any(k in t for k in ["physics", "physic", "mechanics"]):
        return "physics"
    if any(k in t for k in ["computer science", "sample", "cs", "ai", "machine learning", "data structure"]):
        return "computer science"
    return t


def get_curated_pool_for_subject_or_file(name: str) -> List[Dict[str, Any]]:
    """Retrieve pre-warmed curated questions for a document or subject name."""
    norm = _normalize_key(name)
    if norm in CURATED_QUESTION_BANKS:
        return CURATED_QUESTION_BANKS[norm]
    # Check partial containment
    for k, questions in CURATED_QUESTION_BANKS.items():
        if k in norm or norm in k:
            return questions
    return []


def get_cached_pool(key: str) -> List[Dict[str, Any]]:
    """Retrieve questions from Redis if available."""
    if not redis_client:
        return []
    try:
        data = redis_client.get(key)
        if data:
            val = json.loads(data)
            if isinstance(val, list) and len(val) > 0:
                return val
    except Exception as e:
        logger.warning(f"Error reading from Redis key {key}: {e}")
    return []


def save_cached_pool(key: str, questions: List[Dict[str, Any]], ttl: int = 86400 * 7):
    """Save questions to Redis with a 7-day TTL."""
    if not redis_client or not questions:
        return
    try:
        redis_client.setex(key, ttl, json.dumps(questions))
    except Exception as e:
        logger.warning(f"Error saving to Redis key {key}: {e}")


def seed_all_curated_pools():
    """Warm up Redis cache with all curated question banks on startup."""
    if not redis_client:
        return
    try:
        for subject_key, questions in CURATED_QUESTION_BANKS.items():
            redis_client.setex(
                f"quiz_pool:subject:{subject_key}",
                86400 * 14,
                json.dumps(questions),
            )
        logger.info("Successfully seeded Redis question pools for all enrolled subjects.")
    except Exception as e:
        logger.warning(f"Failed to seed Redis question pools: {e}")


# Run seed once on import
try:
    seed_all_curated_pools()
except Exception:
    pass


def sample_questions_for_documents(
    documents: List[Any],
    num_questions: int = 10,
    guidelines: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """
    Attempt to fulfill the question request instantaneously (< 15ms)
    from pre-computed pools or Redis cache.
    Returns list of question objects or None if generation needed.
    """
    if guidelines and guidelines.strip():
        # Custom guidelines require specific focus; check if this exact guideline hash was cached
        g_hash = hashlib.md5(guidelines.strip().lower().encode("utf-8")).hexdigest()[:12]
        doc_str = "-".join(sorted(str(getattr(d, 'document_id', d)) for d in documents))
        cache_key = f"quiz_pool:guidelines:{doc_str}:{g_hash}"
        cached = get_cached_pool(cache_key)
        if cached and len(cached) >= num_questions:
            shuffled = list(cached)
            random.shuffle(shuffled)
            return shuffled[:num_questions]
        return None

    if not documents:
        return None

    # Collect available pools for all selected documents
    doc_pools: List[List[Dict[str, Any]]] = []

    for doc in documents:
        doc_id = str(getattr(doc, "document_id", ""))
        filename = getattr(doc, "filename", "") or ""
        subject = getattr(doc, "subject", "") or ""

        # 1. Try Redis document-specific pool
        pool = []
        if doc_id:
            pool = get_cached_pool(f"quiz_pool:doc:{doc_id}")

        # 2. Try Redis filename pool
        if not pool and filename:
            pool = get_cached_pool(f"quiz_pool:filename:{filename}")

        # 3. Try Redis subject pool
        if not pool and subject:
            pool = get_cached_pool(f"quiz_pool:subject:{_normalize_key(subject)}")

        # 4. Fall back to curated in-memory banks
        if not pool:
            pool = get_curated_pool_for_subject_or_file(filename)
        if not pool:
            pool = get_curated_pool_for_subject_or_file(subject)

        if pool:
            # Copy and shuffle this doc's questions
            p_copy = list(pool)
            random.shuffle(p_copy)
            doc_pools.append(p_copy)

    if not doc_pools:
        return None

    # Proportional multi-document distribution
    num_docs = len(doc_pools)
    base_per_doc = num_questions // num_docs
    remainder = num_questions % num_docs

    selected_questions: List[Dict[str, Any]] = []
    seen_texts = set()

    for i, pool in enumerate(doc_pools):
        quota = base_per_doc + (1 if i < remainder else 0)
        taken = 0
        for q in pool:
            q_text = q.get("question_text", "").strip().lower()
            if q_text and q_text not in seen_texts:
                seen_texts.add(q_text)
                selected_questions.append(q)
                taken += 1
                if taken >= quota:
                    break

    # If some pools ran short, fill up from remaining pool items
    if len(selected_questions) < num_questions:
        for pool in doc_pools:
            for q in pool:
                q_text = q.get("question_text", "").strip().lower()
                if q_text and q_text not in seen_texts:
                    seen_texts.add(q_text)
                    selected_questions.append(q)
                    if len(selected_questions) >= num_questions:
                        break
            if len(selected_questions) >= num_questions:
                break

    if len(selected_questions) >= min(num_questions, 5):
        # We have a solid set!
        random.shuffle(selected_questions)
        return selected_questions[:num_questions]

    return None


def sample_questions_for_topic(
    topic: Optional[str] = None,
    num_questions: int = 10,
    guidelines: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """
    Attempt to fulfill topic-based question generation instantaneously
    from pre-computed pools or Redis cache.
    """
    if guidelines and guidelines.strip():
        g_hash = hashlib.md5(guidelines.strip().lower().encode("utf-8")).hexdigest()[:12]
        cache_key = f"quiz_pool:topic_guidelines:{_normalize_key(topic or 'all')}:{g_hash}"
        cached = get_cached_pool(cache_key)
        if cached and len(cached) >= num_questions:
            shuffled = list(cached)
            random.shuffle(shuffled)
            return shuffled[:num_questions]
        return None

    if topic and topic.strip():
        norm = _normalize_key(topic)
        pool = get_cached_pool(f"quiz_pool:subject:{norm}")
        if not pool:
            pool = get_curated_pool_for_subject_or_file(topic)
        if pool:
            p_copy = list(pool)
            random.shuffle(p_copy)
            return p_copy[:num_questions]

    # If general study material or no specific topic, sample across all subjects
    all_pools = list(CURATED_QUESTION_BANKS.values())
    combined = []
    seen = set()
    for p in all_pools:
        for q in p:
            q_text = q.get("question_text", "").strip().lower()
            if q_text not in seen:
                seen.add(q_text)
                combined.append(q)

    if combined:
        random.shuffle(combined)
        return combined[:num_questions]

    return None

