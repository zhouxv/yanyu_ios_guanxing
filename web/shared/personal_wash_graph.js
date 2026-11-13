/* Uniform-cost search visits one cost layer at a time. Records retain the
 * cheapest parent for replay. Spill the same records to the worker's local
 * IndexedDB instead of discarding states when the memory threshold is hit. */
(function (root) {
    'use strict';
    function transactionDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error || Error('本机存储事务中断'));
        });
    }
    function requestValue(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    class Graph {
        constructor(dbName, memoryLimit = 30000) {
            this.name = dbName;
            this.limit = memoryLimit;
            this.rows = new Map();
            this.heap = new root.AutoWash2Optimizer.MinHeap((a,b) => a.cost - b.cost);
            this.db = null;
        }
        async spill() {
            const request = indexedDB.open(this.name, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore('states', {keyPath:'key'}).createIndex('pending','pending');
            };
            this.db = await requestValue(request);
            const tx = this.db.transaction('states','readwrite');
            const done = transactionDone(tx);
            const store = tx.objectStore('states');
            for (const row of this.rows.values()) store.put(row);
            await done;
            this.rows = this.heap = null;
        }
        async read(key) {
            if (!this.db) return this.rows.get(key);
            return requestValue(this.db.transaction('states').objectStore('states').get(key));
        }
        async take(count) {
            const batch = [];
            if (!this.db) {
                while (this.heap.size && batch.length < count) {
                    const row = this.heap.peek();
                    if (row.pending == null || this.rows.get(row.key) !== row) { this.heap.pop(); continue; }
                    if (batch.length && batch[0].cost !== row.cost) break;
                    batch.push(this.heap.pop());
                }
                return batch;
            }
            const tx = this.db.transaction('states');
            const done = transactionDone(tx);
            const cursor = tx.objectStore('states').index('pending').openCursor();
            cursor.onsuccess = () => {
                const entry = cursor.result;
                if (!entry || (batch.length && entry.key !== batch[0].cost)) return;
                batch.push(entry.value);
                if (batch.length < count) entry.continue();
            };
            await done;
            return batch;
        }
        async commit(batch, successors) {
            for (const row of batch) delete row.pending;
            if (!this.db) {
                for (const row of successors.values()) {
                    if ((this.rows.get(row.key)?.cost ?? Infinity) <= row.cost) continue;
                    this.rows.set(row.key, row);
                    this.heap.push(row);
                }
                if (this.rows.size > this.limit) await this.spill();
                return;
            }
            const tx = this.db.transaction('states','readwrite');
            const done = transactionDone(tx);
            const store = tx.objectStore('states');
            for (const row of batch) store.put(row);
            for (const row of successors.values()) {
                const existing = store.get(row.key);
                existing.onsuccess = () => {
                    if ((existing.result?.cost ?? Infinity) > row.cost) store.put(row);
                };
            }
            await done;
        }
        close() {
            if (this.db) this.db.close();
            this.rows = this.heap = null;
        }
    }
    root.PersonalWashGraph = Graph;
})(self);
