import type { Part } from '@google/generative-ai';

export async function fileToGenerativePart(file: File): Promise<Part> {
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

export async function generateListing(images: File[], instructions: string, appPassword: string) {
  const imageParts = await Promise.all(images.map(fileToGenerativePart));

  const resp = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-password': appPassword
    },
    body: JSON.stringify({ imageParts, instructions })
  });

  if (!resp.ok) {
    let errText = await resp.text();
    try { errText = JSON.parse(errText).error; } catch {}
    throw new Error(errText);
  }

  return await resp.json();
}
