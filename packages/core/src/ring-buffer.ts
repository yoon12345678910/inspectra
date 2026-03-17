export class RingBuffer<T> {
  #capacity: number;
  #items: T[] = [];

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  push(item: T) {
    if (this.#items.length >= this.#capacity) {
      this.#items.shift();
    }
    this.#items.push(item);
  }

  pushMany(items: T[]) {
    for (const item of items) {
      this.push(item);
    }
  }

  toArray() {
    return [...this.#items];
  }

  clear() {
    this.#items = [];
  }
}

