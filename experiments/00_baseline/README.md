# CPU smoke measurements

These small samples exercise the local Express gateway and Kokoro worker through
HTTP. They were taken in a shared Linux workspace using Kokoro 0.9.4, PyTorch
2.8.0 CPU, and `OMP_NUM_THREADS=2`. Each run warms the worker once. The runner
measures full WAV responses and excludes failed requests from latency percentiles.

| Concurrency | Successful | Rejected with HTTP 503 |
|---|---:|---:|
| 1 | 3 of 3 | 0 |
| 2 | 1 of 6 | 5 |

The worker serves one request at a time and immediately rejects requests that
arrive while it is busy. The raw data describes this smoke run on shared hardware.
Larger samples on controlled hardware are needed for a performance comparison.
