function FontFaceObserver(family, descriptors) {
  this.family = family;
}

FontFaceObserver.prototype.load = function (text, timeout) {
  return Promise.resolve(this);
};

FontFaceObserver.FontFaceObserver = FontFaceObserver;

module.exports = FontFaceObserver;
