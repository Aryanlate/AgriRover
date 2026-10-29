// Supabase Edge Function: upload-plant-image
//
// Receives a RAW JPEG body from the ESP32-CAM, authenticates it with the
// shared secret header `x-camera-token`, stores the image in the
// `plant-images` Storage bucket, and inserts a row into `plant_images`
// so the website can list and display it.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   CAMERA_UPLOAD_TOKEN  - shared secret, must match the firmware's value
//   SUPABASE_URL         - provided automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS) - provided automatically
//
// Deploy:  supabase functions deploy upload-plant-image

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "plant-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  // Allow uploads only through POST.
  if (req.method !== "POST") {
    return Response.json(
      { error: "Use POST to upload an image" },
      { status: 405 }
    );
  }

  // Authenticate the ESP32-CAM.
  const expectedToken = Deno.env.get("CAMERA_UPLOAD_TOKEN");
  const receivedToken = req.headers.get("x-camera-token");

  if (!expectedToken || receivedToken !== expectedToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept JPEG images only.
  const contentType = req.headers.get("content-type") || "";

  if (!contentType.toLowerCase().startsWith("image/jpeg")) {
    return Response.json(
      { error: "Only JPEG images are accepted" },
      { status: 415 }
    );
  }

  const declaredSize = Number(req.headers.get("content-length") || "0");

  if (declaredSize > MAX_IMAGE_SIZE) {
    return Response.json({ error: "Image exceeds 5 MB" }, { status: 413 });
  }

  try {
    const image = new Uint8Array(await req.arrayBuffer());

    // Validate size and JPEG start/end markers.
    if (
      image.length < 4 ||
      image.length > MAX_IMAGE_SIZE ||
      image[0] !== 0xff ||
      image[1] !== 0xd8 ||
      image[image.length - 2] !== 0xff ||
      image[image.length - 1] !== 0xd9
    ) {
      return Response.json({ error: "Invalid JPEG image" }, { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
    );

    const secretKey =
      secretKeys["default"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !secretKey) {
      return Response.json(
        { error: "Storage credentials unavailable" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, secretKey);

    const now = new Date();
    const folder = now.toISOString().slice(0, 10);
    const filename = crypto.randomUUID() + ".jpg";
    const imagePath = `${folder}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, image, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
      return Response.json(
        { error: "Storage upload failed" },
        { status: 500 }
      );
    }

    // Persist the public URL so the website can list and display the image.
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(imagePath);

    const { error: insertError } = await supabase
      .from("plant_images")
      .insert({ image_url: publicUrlData.publicUrl });

    if (insertError) {
      console.error("DB insert failed:", insertError);
      // The file is stored; still report success so nothing is lost.
      return Response.json(
        { success: true, image_path: imagePath, warning: "db_insert_failed" },
        { status: 200 }
      );
    }

    return Response.json({
      success: true,
      image_path: imagePath,
      image_url: publicUrlData.publicUrl,
      captured_at: now.toISOString(),
      size_bytes: image.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json(
      { error: "Image processing failed" },
      { status: 500 }
    );
  }
});
