import { firestore, storage, FieldValue } from './firebaseConfig';
import FirestoreService from './FirestoreService';

export interface GalleryAlbum {
  id: string;
  name: string;
  description?: string;
  coverPhotoUrl?: string;
  photoCount?: number;
  visibility?: string;
  createdAt?: any;
  date?: string;
}

export interface GalleryPhoto {
  id: string;
  url: string;
  uploadedBy?: string;
  createdAt?: any;
}

class GalleryService {
  private async getChurchId(): Promise<string> {
    const churchId = await FirestoreService.getChurchId();
    if (!churchId) throw new Error("No church context found.");
    return churchId;
  }

  async getAlbums(limitCount = 60): Promise<GalleryAlbum[]> {
    const churchId = await this.getChurchId();
    const snapshot = await firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GalleryAlbum));
  }

  async createAlbum(albumData: Partial<GalleryAlbum>, coverUri?: string): Promise<void> {
    const churchId = await this.getChurchId();

    let coverPhotoUrl = '';
    if (coverUri) {
      // Upload cover photo to storage
      const filename = `cover_${Date.now()}.jpg`;
      const storageRef = storage().ref(`Rhema Church/${churchId}/gallery_covers/${filename}`);
      await storageRef.putFile(coverUri);
      coverPhotoUrl = await storageRef.getDownloadURL();
    }

    await firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .add({
        ...albumData,
        coverPhotoUrl,
        photoCount: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
  }

  async getAlbumPhotos(albumId: string, limitCount = 120): Promise<GalleryPhoto[]> {
    const churchId = await this.getChurchId();
    const snapshot = await firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .doc(albumId)
      .collection('photos')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GalleryPhoto));
  }

  async uploadPhotosToAlbum(albumId: string, uris: string[], uploadedBy: string): Promise<void> {
    const churchId = await this.getChurchId();

    const albumRef = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .doc(albumId);

    let uploadedCount = 0;
    const CHUNK_SIZE = 4;

    // Upload files concurrently in bounded batches for fast uploads without saturating sockets
    for (let i = 0; i < uris.length; i += CHUNK_SIZE) {
      const chunk = uris.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(async (uri) => {
          const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const storageRef = storage().ref(`Rhema Church/${churchId}/gallery/${albumId}/${filename}`);
          await storageRef.putFile(uri);
          const url = await storageRef.getDownloadURL();
          await albumRef.collection('photos').add({
            url,
            uploadedBy,
            createdAt: FieldValue.serverTimestamp(),
          });
        })
      );
      results.forEach((res) => {
        if (res.status === 'fulfilled') uploadedCount++;
        else console.error('Failed to upload photo:', res.reason);
      });
    }

    // Update photo count
    if (uploadedCount > 0) {
      await albumRef.update({
        photoCount: FieldValue.increment(uploadedCount)
      });
    }
  }

  async deletePhoto(photoId: string, albumId: string, photoUrl: string): Promise<void> {
    const churchId = await this.getChurchId();

    // Delete from firestore
    const albumRef = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .doc(albumId);

    await albumRef.collection('photos').doc(photoId).delete();

    // Update count
    await albumRef.update({
      photoCount: FieldValue.increment(-1)
    });

    // Delete from storage
    try {
      const storageRef = storage().refFromURL(photoUrl);
      await storageRef.delete();
    } catch (e) {
      console.log("Could not delete from storage, might already be deleted", e);
    }
  }

  async deleteAlbum(albumId: string, coverPhotoUrl?: string): Promise<void> {
    const churchId = await this.getChurchId();

    const albumRef = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('gallery_albums')
      .doc(albumId);

    // Delete all photos inside (parallel storage deletes + batched Firestore deletes)
    const photosSnapshot = await albumRef.collection('photos').get();
    const docs = photosSnapshot.docs;

    const STORAGE_CHUNK = 8;
    for (let i = 0; i < docs.length; i += STORAGE_CHUNK) {
      const chunk = docs.slice(i, i + STORAGE_CHUNK);
      await Promise.allSettled(
        chunk.map((doc) => {
          const data = doc.data() as GalleryPhoto;
          if (!data.url) return Promise.resolve();
          return storage().refFromURL(data.url).delete().catch(() => { });
        })
      );
    }

    const batchPromises: Promise<any>[] = [];
    for (let i = 0; i < docs.length; i += 450) {
      const batch = firestore().batch();
      docs.slice(i, i + 450).forEach((doc) => batch.delete(doc.ref));
      batchPromises.push(batch.commit());
    }
    if (batchPromises.length > 0) {
      await Promise.all(batchPromises);
    }

    // Delete cover photo if exists
    if (coverPhotoUrl) {
      try {
        const storageRef = storage().refFromURL(coverPhotoUrl);
        await storageRef.delete();
      } catch (e) { }
    }

    // Delete album doc
    await albumRef.delete();
  }
}

export default new GalleryService();
