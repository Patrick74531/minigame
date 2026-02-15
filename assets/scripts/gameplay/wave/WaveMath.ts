export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function toFinite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toPositiveInt(value: unknown, fallback: number): number {
    const num = toFinite(value, fallback);
    const intVal = Math.floor(num);
    return intVal > 0 ? intVal : Math.max(1, Math.floor(fallback));
}

export function toNonNegativeInt(value: unknown, fallback: number): number {
    const num = toFinite(value, fallback);
    const intVal = Math.floor(num);
    return intVal >= 0 ? intVal : Math.max(0, Math.floor(fallback));
}

export function randomInt(min: number, max: number): number {
    const low = Math.floor(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    if (high <= low) return low;
    return low + Math.floor(Math.random() * (high - low + 1));
}

export function randomRange(min: number, max: number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    if (high <= low) return low;
    return low + Math.random() * (high - low);
}

export function indexOfMax(values: number[]): number {
    let maxIdx = 0;
    let maxVal = values[0] ?? Number.NEGATIVE_INFINITY;
    for (let i = 1; i < values.length; i++) {
        if (values[i] > maxVal) {
            maxVal = values[i];
            maxIdx = i;
        }
    }
    return maxIdx;
}
