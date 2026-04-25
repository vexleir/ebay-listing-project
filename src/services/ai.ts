type ImagePart = { inlineData: { data: string; mimeType: string } };

export async function fileToGenerativePart(file: File): Promise<ImagePart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64str = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64str,
          mimeType: file.type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function generateListing(images: File[], instructions: string, appPassword: string, signal?: AbortSignal) {
  const imageParts = await Promise.all(images.map(fileToGenerativePart));

  const resp = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appPassword}`
    },
    body: JSON.stringify({ imageParts, instructions }),
    signal
  });

  if (!resp.ok) {
    let errText = await resp.text();
    try { errText = JSON.parse(errText).error; } catch {}
    throw new Error(errText);
  }

  return await resp.json();
}
