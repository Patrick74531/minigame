import { Node } from 'cc';

export function findChildByName(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = findChildByName(child, name);
        if (found) return found;
    }
    return null;
}

export function pathBaseName(path?: string): string | null {
    if (!path) return null;
    const trimmed = path.trim();
    if (!trimmed) return null;
    const idx = trimmed.lastIndexOf('/');
    const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
    return base || null;
}

export function findRightHandBone(root: Node): Node | null {
    const exactNames = [
        'mixamorig:RightHand',
        'mixamorig_RightHand',
        'RightHand',
        'right_hand',
        'Hand.R',
        'hand_r',
    ];
    for (const name of exactNames) {
        const node = findChildByName(root, name);
        if (node) return node;
    }

    const allNodes: Node[] = [];
    collectChildren(root, allNodes);
    let best: Node | null = null;
    let bestScore = -1;

    for (const node of allNodes) {
        const score = scoreRightHandName(node.name);
        if (score > bestScore) {
            best = node;
            bestScore = score;
        }
    }
    return bestScore >= 3 ? best : null;
}

function collectChildren(root: Node, out: Node[]): void {
    out.push(root);
    for (const child of root.children) {
        collectChildren(child, out);
    }
}

function scoreRightHandName(name: string): number {
    if (!name) return 0;
    const raw = name.toLowerCase();
    const compact = raw.replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (compact.includes('righthand')) score += 6;
    if (compact.includes('hand') && compact.includes('right')) score += 4;
    if (compact.includes('handr') || compact.includes('rhand')) score += 3;
    if (compact.includes('right')) score += 1;
    if (compact.includes('hand')) score += 1;
    return score;
}
