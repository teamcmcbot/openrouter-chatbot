// Quick test to verify output_images extraction works in chat history API
const { extractOutputImageDataUrls } = require("./lib/utils/parseOutputImages");

// Test data that mimics a message with embedded images in content
const testContent = `Here are your generated images:

![Image 1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==)

Some text between images.

![Image 2](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA==)`;

// Test the extraction function directly
const result = extractOutputImageDataUrls({
  choices: [
    {
      message: {
        content: testContent,
      },
    },
  ],
});

console.log("Extracted output images:", result);
console.log("Number of images found:", result.length);

// Expected: Should find 2 data URLs
if (result.length === 2) {
  console.log("✅ Test passed: Found expected number of images");

  // Verify they start with data:image/
  const allValidDataUrls = result.every((url) => url.startsWith("data:image/"));
  if (allValidDataUrls) {
    console.log("✅ Test passed: All extracted URLs are valid data URLs");
  } else {
    console.log("❌ Test failed: Some extracted URLs are not valid data URLs");
  }
} else {
  console.log(`❌ Test failed: Expected 2 images, found ${result.length}`);
}
