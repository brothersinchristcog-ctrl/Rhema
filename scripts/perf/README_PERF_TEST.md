# Rhema App Performance & JMeter Load Testing Guide

This folder contains the ready-to-import **Apache JMeter** test plan (`rhema_load_test.jmx`) pre-configured for the **Firebase Local Emulator** so you can run load and concurrency benchmarks for **$0** without affecting real church members, payments, or live notifications.

---

## Step 1: Start the Firebase Local Emulator (Windows PowerShell)

1. Build Cloud Functions first:
   ```powershell
   npm --prefix functions run build
   ```
2. Start the emulators in safe offline `demo-rhema` mode (Auth + Firestore + Functions + Database — skips multi-bucket Storage config):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Zulu\zulu-21"
   $env:Path = "$env:JAVA_HOME\bin;$env:Path"
   $env:FUNCTIONS_DISCOVERY_TIMEOUT = "30"
   firebase emulators:start --only auth,functions,firestore,database --project demo-rhema
   ```
3. *(Optional)* Seed sample test users into the emulator (`AUTH` & `FIRESTORE` emulator ports are configured in `firebase.json`: `9099` and `8080`):
   - Emulator UI opens in your browser at `http://127.0.0.1:4000`
   - Functions Emulator runs at `http://127.0.0.1:5001`

---

## Step 2: Run Apache JMeter

### Option A — JMeter GUI (Visual)
1. **Important:** If JMeter is already open, close it or choose **File → Open** (do **not** click Save beforehand) and select `scripts/perf/rhema_load_test.jmx` from the repo so it loads the updated `5`-thread + warm-up configuration (`THREADS=5`, `RAMP_SEC=10`, `LOOPS=10`).
2. Click the green **Start (▶)** button.
   - **Expected run time:** **~40–60 seconds** on the first run (1 thread warms all 5 function workers sequentially in ~30s, then 5 threads run 10 loops = 250 load requests in ~15–20s). Repeat runs while the emulator stays open finish in **~10–20 seconds**.
3. Watch **Summary Report**:
   - **Avg / 90% Line / 95% Line (ms):** Target `< 500ms` (read endpoints)
   - **Error %:** Target `0.00%`
   - **Throughput (/sec):** Requests per second your backend handles concurrently

### Option B — JMeter CLI (Always Reads Latest File + Generates HTML Report)
```powershell
jmeter -n -t scripts/perf/rhema_load_test.jmx -Jthreads=5 -Jramp=10 -Jloops=10 -l scripts/perf/results.jtl -e -o scripts/perf/html-report
```
Then open `scripts/perf/html-report/index.html` in your browser for full charts (Response Time Percentiles, Active Threads, Throughput). For higher concurrency (`100+` threads), run against a cloud staging project rather than a single laptop's local Node workers.

---

## Step 3: Measure Real Mobile App Screen Speed (Release APK Only)

JMeter tests backend APIs; to measure phone screen opening & scrolling FPS:

1. Build and install a **Release build** (never measure speed in Debug Metro mode):
   ```powershell
   cd app
   npx expo run:android --variant release
   ```
2. Measure cold app startup time (`TotalTime` in ms):
   ```powershell
   adb shell am start -S -W com.brothersinchristcog.cog_mobile/.MainActivity
   ```
3. Measure scrolling frame drops while scrolling Sermons / Events / Prayer Wall / Matrimony:
   ```powershell
   adb shell dumpsys gfxinfo com.brothersinchristcog.cog_mobile reset
   # Scroll through screens for 15 seconds on device
   adb shell dumpsys gfxinfo com.brothersinchristcog.cog_mobile framestats
   ```

> **Note:** To run JMeter against a future separate **staging** Firebase project instead of local emulator, override `-Jprotocol=https -Jhost=us-central1-<staging-project-id>.cloudfunctions.net -JfunctionsPort=443 -JprojectId=<staging-project-id>`. Never run high-load tests against production `rhema-global-ministries`.
