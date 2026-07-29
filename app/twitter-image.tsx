import OpenGraphImage from './opengraph-image';

export { alt, contentType, size } from './opengraph-image';

export default async function TwitterImage() {
  return OpenGraphImage();
}
