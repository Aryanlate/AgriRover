# Dataset notes

Leaf-only image classification: `leaf_healthy`, `leaf_diseased`, and optional `background`.
The folder name is the label. No bounding boxes.

- **Classes**: `leaf_healthy`, `leaf_diseased`, and optional `background`. No stem classes or stem checks are used.
- **Background class**: If `ml/dataset/raw/public/my_images/background/` has images, it is included as the `background` class (no plant found).
- **Training source**: Trained only on public images of healthy and diseased leaves (and optional background).
- **WARNING**: The test set is **not** from ESP32-CAM photos. Model evaluation reflects public leaf dataset distribution; domain shift may occur under rover ESP32-CAM lighting, lens distortion, and vibration.
- **Naming format for rover inbox**: `rover_<plant>_<class>_<plantID>_<date>_<seq>.jpg`
