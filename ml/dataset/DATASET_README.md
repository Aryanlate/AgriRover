# Dataset notes

Two-class leaf image classification: `leaf_healthy` and `leaf_diseased`.
The folder name is the label. No bounding boxes.

- **Classes**: `leaf_healthy` and `leaf_diseased`. There is no background class, no stem classes, and no stem checking.
- **Training source**: Trained on public images of healthy and diseased leaves.
- **WARNING**: The test set is **not** from ESP32-CAM photos. Model evaluation reflects public leaf dataset distribution; domain shift may occur under rover ESP32-CAM lighting, lens distortion, and vibration.
- **Naming format for rover inbox**: `rover_<plant>_<class>_<plantID>_<date>_<seq>.jpg`
