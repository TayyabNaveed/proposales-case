# Proposal artwork — version 1

Six original, locally authored SVG illustrations and matching PNG exports. The visual system draws on the violet and deep ink of the existing Metascalers brand artwork, softened with warm paper backgrounds, generous margins and subtle depth. No third-party icons, fonts, external image references or embedded scripts are required.

| Asset | Use |
|---|---|
| website-experience | Website foundation, additional pages, booking, enquiry flow and FAQ |
| search-discoverability | Technical SEO, AI visibility, Business Profile, Search Console and ongoing SEO |
| paid-advertising | Advertising setup and management |
| social-media | Social media management |
| ongoing-care | Website maintenance |
| cover | Proposal opening/background; open space on the left |

Category exports are 1600 × 1000. The cover is 1920 × 1080. SVGs are the editable masters; PNGs were rendered with sharp. Text and service names belong in native proposal fields, not inside the artwork. Native titles remain readable and editable when images are resized.

These are proposed visual assets, not wired into draft generation or uploaded to Proposales. Cover support, overlay contrast and cropping must be checked in the actual proposal. Grouped service blocks must preserve one-time/monthly and core/optional boundaries. Reusing a category illustration does not imply bundling every service in that category into one commercial item.

To regenerate a PNG from its SVG using the installed sharp package:

```sh
node --input-type=module -e 'import sharp from "sharp"; await sharp(process.argv[1]).png().toFile(process.argv[2]);' public/proposal-artwork/v1/website-experience.svg public/proposal-artwork/v1/website-experience.png
```
