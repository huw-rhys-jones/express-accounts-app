// Import your function (adjust path as needed)
import { extractAmount, extractData, reconstructLines } from './utils/extractors.js';
import { createWorker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock TextRecognition format converter for Tesseract.js results
const convertTesseractToMLKit = (tesseractResult) => {
  const lines = tesseractResult.data.lines || [];
  console.log(`🔍 Tesseract found ${lines.length} lines`);

  const blocks = lines
    .filter(line => line.text && line.text.trim()) // Filter out empty lines
    .map((line, index) => ({
      lines: [{
        text: line.text.trim(),
        frame: {
          top: line.bbox.y0,
          left: line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0,
          width: line.bbox.x1 - line.bbox.x0
        }
      }]
    }));

  console.log(`🔧 Converted to ${blocks.length} blocks for ML Kit format`);
  return { blocks };
};

const testImageOCR = async (imagePath) => {
  const worker = await createWorker('eng');
  try {
    console.log(`\n🔍 Processing: ${path.basename(imagePath)}`);

    // Perform OCR with Tesseract
    const { data: { text, lines } } = await worker.recognize(imagePath);
    console.log(`📝 Raw OCR text:\n${text}`);

    // Convert Tesseract format to ML Kit format
    const mlKitResult = convertTesseractToMLKit({ data: { lines } });

    // Process through the same pipeline as ReceiptAdd.js
    const reconstructedText = reconstructLines(mlKitResult.blocks || []);
    console.log(`🔧 Reconstructed text (${reconstructedText.length} chars):\n'${reconstructedText}'`);

    // Also test extractAmount directly on raw text
    const directExtract = extractAmount(text);
    console.log(`💰 Direct extractAmount on raw text:`, directExtract);

    const extractedData = extractData(reconstructedText);
    console.log(`📊 Extracted data:`, {
      amount: extractedData?.money?.value,
      date: extractedData?.date,
      vat: extractedData?.vat,
      category: extractedData?.category
    });

    return extractedData;
  } finally {
    await worker.terminate();
  }
};

const runImageTests = async () => {
  const receiptsDir = path.join(process.cwd(), '..', 'receipts');
  const imageFiles = fs.readdirSync(receiptsDir)
    .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
    .slice(0, 5); // Test first 5 images

  console.log(`🧪 Testing OCR on ${imageFiles.length} receipt images...\n`);

  for (const imageFile of imageFiles) {
    const imagePath = path.join(receiptsDir, imageFile);
    try {
      await testImageOCR(imagePath);
    } catch (error) {
      console.error(`❌ Error processing ${imageFile}:`, error.message);
    }
  }
};

// Run the image tests
runImageTests().catch(console.error);