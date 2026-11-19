import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { purgeMatrimonyUserData } from './store.js';
async function handleConsoleProfileDeletion(uid, deletedData, deletedCollection) {
    if (!uid)
        return;
    if (deletedData?.selfReset === true) {
        return;
    }
    const db = getFirestore();
    // Clean up orphaned subcollections, photos, matches, and interests without restricting
    // the member so they can create a new profile and go through admin approval again.
    await purgeMatrimonyUserData(db, uid, {
        banOnDelete: false,
        actorUid: 'firebase_console',
        source: 'console_delete',
        auditAction: `MATRIMONY_CONSOLE_DELETE_${deletedCollection.toUpperCase()}`,
    });
}
export const onMatrimonyProfileDeleted = onDocumentDeleted('matrimony_profiles/{uid}', async (event) => {
    const uid = event.params.uid;
    const deletedData = event.data?.data();
    await handleConsoleProfileDeletion(uid, deletedData, 'matrimony_profiles');
});
export const onMatrimonyAdminProfileDeleted = onDocumentDeleted('matrimony_admin_profiles/{uid}', async (event) => {
    const uid = event.params.uid;
    const deletedData = event.data?.data();
    await handleConsoleProfileDeletion(uid, deletedData, 'matrimony_admin_profiles');
});
//# sourceMappingURL=triggers.js.map