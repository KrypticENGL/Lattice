#include <cstdio>

struct Node {
    int val;
    Node* next;
    Node(int v) : val(v), next(nullptr) {}
};

int main() {
    Node* head = new Node(3);
    head->next = new Node(7);
    head->next->next = new Node(1);
    head->next->next->next = new Node(9);
    int sum = 0;
    for (Node* cur = head; cur != nullptr; cur = cur->next) {
        sum += cur->val;
    }
    printf("sum=%d\n", sum);
    return 0;
}
