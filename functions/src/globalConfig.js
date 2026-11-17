import { setGlobalOptions } from 'firebase-functions/v2';
/**
 * Configure 2nd Gen Cloud Functions to use fractional CPU ('gcf_gen1' = 0.167 vCPU for 256MiB)
 * instead of 1 full vCPU per service, plus maxInstances cap.
 * Prevents exceeding regional Cloud Run CPU quota ("Quota exceeded for total allowable CPU per project per region")
 * when deploying 45+ services concurrently in asia-south1.
 * Note: Cloud Run requires concurrency = 1 whenever cpu < 1.
 */
setGlobalOptions({
    cpu: 'gcf_gen1',
    concurrency: 1,
    maxInstances: 5,
});
//# sourceMappingURL=globalConfig.js.map