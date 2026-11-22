import { Alert } from 'react-native';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { RHEMA_CHURCH_ID, RHEMA_ROOT_COLLECTION } from '../../../constants/ChurchConfig';
import { ChatMediaAttachment } from '../types/chat';

export interface PickedLocalAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

export const rhemaChatMediaService = {
  async pickImages(allowsMultipleSelection = true): Promise<PickedLocalAsset[]> {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection,
      selectionLimit: allowsMultipleSelection ? 6 : 1,
      quality: 0.78,
    });
    if (res.canceled || !res.assets?.length) return [];
    return res.assets.map((a, idx) => ({
      uri: a.uri,
      fileName: a.fileName || `photo_${Date.now()}_${idx}.jpg`,
      mimeType: a.mimeType || 'image/jpeg',
      sizeBytes: a.fileSize,
      width: a.width,
      height: a.height,
    }));
  },

  async pickVideo(): Promise<PickedLocalAsset | null> {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 0.75,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    return {
      uri: a.uri,
      fileName: a.fileName || `video_${Date.now()}.mp4`,
      mimeType: a.mimeType || 'video/mp4',
      sizeBytes: a.fileSize,
      width: a.width,
      height: a.height,
      durationMs: typeof a.duration === 'number' ? a.duration : undefined,
    };
  },

  async capturePhotoOrVideo(mode: 'photo' | 'video'): Promise<PickedLocalAsset | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Please allow camera access to capture photos or videos.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: mode === 'video' ? ['videos'] : ['images'],
      quality: 0.78,
      videoMaxDuration: 60,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    const isVideo = a.type === 'video' || mode === 'video';
    return {
      uri: a.uri,
      fileName: a.fileName || `${isVideo ? 'video' : 'photo'}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      mimeType: a.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
      sizeBytes: a.fileSize,
      width: a.width,
      height: a.height,
      durationMs: typeof a.duration === 'number' ? a.duration : undefined,
    };
  },

  async pickDocument(): Promise<PickedLocalAsset | null> {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const doc = res.assets[0];
    return {
      uri: doc.uri,
      fileName: doc.name || `document_${Date.now()}`,
      mimeType: doc.mimeType || 'application/octet-stream',
      sizeBytes: doc.size,
    };
  },

  async startVoiceRecording(): Promise<Audio.Recording | null> {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Microphone Permission',
        'Please allow microphone access to record voice messages.'
      );
      return null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    return recording;
  },

  async stopVoiceRecording(
    recording: Audio.Recording
  ): Promise<{ uri: string; durationMs: number } | null> {
    try {
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (!uri) return null;
      return {
        uri,
        durationMs: typeof status?.durationMillis === 'number' ? status.durationMillis : 0,
      };
    } catch {
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {}
      return null;
    }
  },

  async uploadAttachment(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgId: string,
    asset: PickedLocalAsset,
    onProgress?: (progress: number) => void
  ): Promise<ChatMediaAttachment> {
    const cid = churchId || RHEMA_CHURCH_ID;
    const cleanName = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${RHEMA_ROOT_COLLECTION}/${cid}/chat/${roomId}/${msgId}/${Date.now()}_${cleanName}`;
    const ref = storage().ref(path);

    const task = ref.putFile(asset.uri, {
      contentType: asset.mimeType,
    });

    if (onProgress) {
      task.on('state_changed', (snap) => {
        if (snap.totalBytes > 0) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      });
    }

    await task;
    const url = await ref.getDownloadURL();
    return {
      url,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      sizeBytes: asset.sizeBytes,
      durationMs: asset.durationMs,
      width: asset.width,
      height: asset.height,
    };
  },

  async uploadGroupAvatar(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    localUri: string
  ): Promise<string> {
    if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
      return localUri;
    }
    const cid = churchId || RHEMA_CHURCH_ID;
    const path = `${RHEMA_ROOT_COLLECTION}/${cid}/chat/${roomId}/avatar_${Date.now()}.jpg`;
    const ref = storage().ref(path);
    await ref.putFile(localUri, { contentType: 'image/jpeg' });
    return await ref.getDownloadURL();
  },
};
