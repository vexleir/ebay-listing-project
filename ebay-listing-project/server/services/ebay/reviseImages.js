// IMG-003 — helpers for `POST /api/ebay/revise` image handling.
//
// The route accepts an `images` array (URLs or data: URIs) and has to:
//   - skip the EPS upload for URLs that already live on i.ebayimg.com /
//     thumbs.ebaystatic.com (re-uploading would waste a Trading API call and
//     could degrade quality through a re-encode)
//   - upload everything else via uploadImagesToEps from listingLifecycle
//   - re-merge the result in the caller's original order so the main
//     image (slot 0) doesn't get reshuffled
//
// `uploadImagesToEps` is injectable so the resolver can be tested without
// hitting the network. Production callers pass the real one from
// services/ebay/listingLifecycle.

const EPS_HOST_FRAGMENTS = ['i.ebayimg.com', 'thumbs.ebaystatic.com'];

function isAlreadyOnEps(url) {
  return typeof url === 'string' && EPS_HOST_FRAGMENTS.some((h) => url.includes(h));
}

async function resolveReviseImageUrls(images, token, { uploadImagesToEps }) {
  if (!Array.isArray(images) || images.length === 0) return [];
  const toUpload = images.filter((img) => !isAlreadyOnEps(img));
  const uploadedUrls = toUpload.length > 0
    ? await uploadImagesToEps(toUpload, token)
    : [];
  let uploadIdx = 0;
  return images.map((img) => (isAlreadyOnEps(img) ? img : uploadedUrls[uploadIdx++]));
}

module.exports = {
  EPS_HOST_FRAGMENTS,
  isAlreadyOnEps,
  resolveReviseImageUrls,
};
