import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function inferExtension(name, mimeType) {
  const trimmedName = String(name || "").trim();
  if (trimmedName.includes(".")) {
    return `.${trimmedName.split(".").pop().toLowerCase()}`;
  }
  if (mimeType === "application/pdf") {
    return ".pdf";
  }
  if (mimeType && mimeType.startsWith("image/")) {
    const raw = mimeType.split("/").pop();
    return raw ? `.${raw.toLowerCase()}` : ".jpg";
  }
  return ".bin";
}

export function normalizeStoredAttachments(attachments = []) {
  return attachments
    .map((attachment, index) => {
      if (!attachment) return null;
      if (typeof attachment === "string") {
        return {
          id: `stored-${index}`,
          url: attachment,
          name: `attachment-${index + 1}`,
          mimeType: null,
          kind: "image",
        };
      }
      return {
        id: attachment.id || attachment.url || attachment.localUri || `attachment-${index}`,
        name: attachment.name || `attachment-${index + 1}`,
        mimeType: attachment.mimeType || null,
        kind: attachment.kind || (attachment.mimeType === "application/pdf" ? "pdf" : "image"),
        url: attachment.url || null,
        localUri: attachment.localUri || null,
      };
    })
    .filter(Boolean);
}

export function createImageAttachment(asset) {
  return {
    id: asset?.uri || `image-${Date.now()}-${randomSuffix()}`,
    localUri: asset?.uri,
    name: asset?.fileName || `image-${Date.now()}-${randomSuffix()}.jpg`,
    mimeType: asset?.type || "image/jpeg",
    kind: "image",
  };
}

export function createDocumentAttachment(asset) {
  return {
    id: asset?.uri || `document-${Date.now()}-${randomSuffix()}`,
    localUri: asset?.uri,
    name: asset?.name || `document-${Date.now()}-${randomSuffix()}.pdf`,
    mimeType: asset?.mimeType || "application/pdf",
    kind: asset?.mimeType === "application/pdf" ? "pdf" : "file",
  };
}

export function getAttachmentUri(attachment) {
  return attachment?.localUri || attachment?.url || null;
}

export function isImageAttachment(attachment) {
  return Boolean(attachment) && (
    attachment.kind === "image" ||
    String(attachment.mimeType || "").startsWith("image/")
  );
}

export async function uploadAttachmentEntries({ folder, userId, attachments = [] }) {
  const storage = getStorage();
  const uploaded = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (!attachment) continue;

    if (attachment.url && !attachment.localUri) {
      uploaded.push({
        id: attachment.id || attachment.url,
        url: attachment.url,
        name: attachment.name || `attachment-${index + 1}`,
        mimeType: attachment.mimeType || null,
        kind: attachment.kind || (attachment.mimeType === "application/pdf" ? "pdf" : "image"),
      });
      continue;
    }

    const sourceUri = getAttachmentUri(attachment);
    if (!sourceUri) continue;

    const extension = inferExtension(attachment.name, attachment.mimeType);
    const filename = `${Date.now()}-${index}-${randomSuffix()}${extension}`;
    const fileRef = ref(storage, `${folder}/${userId}/${filename}`);
    const response = await fetch(sourceUri);
    const blob = await response.blob();
    await uploadBytes(
      fileRef,
      blob,
      attachment.mimeType ? { contentType: attachment.mimeType } : undefined
    );
    const url = await getDownloadURL(fileRef);
    uploaded.push({
      id: url,
      url,
      name: attachment.name || filename,
      mimeType: attachment.mimeType || null,
      kind: attachment.kind || (attachment.mimeType === "application/pdf" ? "pdf" : "image"),
    });
  }

  return uploaded;
}

export async function deleteStoredAttachments(attachments = []) {
  const storage = getStorage();

  for (const attachment of attachments) {
    const url = typeof attachment === "string" ? attachment : attachment?.url;
    if (!url) continue;
    try {
      await deleteObject(ref(storage, url));
    } catch (error) {
      console.warn("Could not delete attachment from storage", url, error?.message || error);
    }
  }
}