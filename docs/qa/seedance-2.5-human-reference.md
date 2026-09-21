# Seedance 2.5: Human Reference Images

## Summary
- Seedance 2.5 **rejects reference images that show real-looking faces**.
- The block comes from **ByteDance itself**, so BytePlus (our current provider) and fal both reject these images.
- Faces only work through a **trusted source**:
  - images or videos generated **on our own BytePlus account**, or
  - a face approved through a **face asset review flow**.
- **BytePlus has three official workarounds** (see below).

## Our test (fal)
- **Model:** Seedance 2.5, fal Playground
- **Input:** a character sheet of a woman
- **Prompt:** "make her dance"
- **Result:** ❌ Rejected
  > image_urls: The images or videos provided may contain likenesses of real people or other private information that cannot be processed.
- *(screenshot attached)*

## Workarounds on BytePlus (our current provider)

BytePlus names three ways to get faces past the block:

### 1. Reuse our own generated outputs (30 days)
- Outputs with faces that **our BytePlus account** generated (e.g. a character made with **Seedream**) can be used as Seedance 2.5 references.
- **Rules:**
  - generated on the **same account**
  - generated **within the last 30 days**
  - the **original** output, not edited
- **Why the fal test failed:** fal is a reseller, so it can't see which account generated an image, and this workaround doesn't apply there.
- ⚠️ BytePlus only says "some models" qualify. Check the exact list in the [official docs](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/ModelArk/2608626#trust-model-output).

### 2. Preset digital characters
- A free, pre-approved library of realistic human faces.
- Good when we need **a realistic person but not a specific one**.
- No compliance risk.

### 3. Authorized real-person assets
- For **specific real people** (actors, models, clients).
- **How it works:**
  1. We create a QR invite in the ModelArk console. This needs real-name or enterprise verification on our account.
  2. The person scans it, does a face check on their phone, uploads photos and gives consent.
  3. The approved assets go into our private library.
- They **authorize once**; new looks or styling don't need another face check.
- A face check can fail because of lighting or angle, and the person just retries.

## Provider support

| Provider | Real faces? | How |
|---|---|---|
| **PiAPI** | ✅ Yes | Face asset review, ~$0.385/s at 720p |
| **SeeGen AI** | ✅ Yes | Face asset review, ~$0.24/s at 720p |
| **BytePlus** (current) | ✅ With workarounds | Own outputs (30 days), preset characters, authorized real people |
| **fal** | ❌ No | Rejects faces (tested above) |
| **Replicate** | ❌ No | No face asset flow |

## What developers report
- The block **comes from ByteDance**. fal only passes the rejection on (`partner_validation_failed`).
- The filter **has become stricter** over the last couple of months: AI-generated avatars and even Seedance's own output frames now get rejected.
- **Stylized or 3D faces pass.** Photoreal faces don't.
- A developer running Seedance 2.5 in their own project uses **SeeGen AI** for its real-person support.

## References
- [BytePlus – Face workarounds (trusted outputs, preset characters, real-person assets)](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/ModelArk/2608626)
- [BytePlus – Add real-human assets](https://docs.byteplus.com/en/docs/ModelArk/2315856)
- [BytePlus – Digital character library](https://docs.byteplus.com/en/docs/ModelArk/2223965)
- [PiAPI – Seedance 2.5](https://piapi.ai/seedance-2-5)
- [SeeGen – Seedance 2.5 API providers](https://seegen.ai/blog/seedance-2-5-api-for-developers)
- [GitHub – fal face test on Seedance 2.5](https://github.com/recoupable/skills/pull/145)
- [Reddit – "likenesses of real people" errors](https://www.reddit.com/r/generativeAI/comments/1upwj55/anyone_else_getting_hit_with_likenesses_of_real/)
- [Reddit – Seedance 2.5 API integration notes](https://www.reddit.com/r/Seedance_AI/comments/1vmzmr4/seedance_25_api_integration_a_couple_of/)
