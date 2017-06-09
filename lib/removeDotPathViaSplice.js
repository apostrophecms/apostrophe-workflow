// Remove the property at the given dot path. if it is a property of an array,
// remove it with `splice` so there are no holes. If not, remove it
// with `delete`.
//
// If the property does not exist in the first place, or any part of the path
// leading to it does not exist, do nothing.
//
// Returns true if `splice` was used.

module.exports = function(o, dotPath) {
  var elements = dotPath.split(/\./);
  var i;
  var lastIndex = elements.length - 1;
  for (i = 0; (i < lastIndex); i++) {
    if (!o) {
      return false;
    }
    o = o[elements[i]];
  }
  if (!o) {
    return false;
  }
  var last = elements[lastIndex];
  if (Array.isArray(o)) {
    o.splice(last, 1);
    return true;
  } else {
    delete o[last];
    return false;
  }
};

