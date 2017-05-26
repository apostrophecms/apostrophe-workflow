// Remove the property at the given dot path. if it is a property of an array,
// remove it with `splice` so there are no holes. If not, remove it
// with `delete`.
//
// Returns true if `splice` was used.

module.exports = function(o, dotPath) {
  var elements = dotPath.split(/\./);
  var i;
  var lastIndex = elements.length - 1;
  for (i = 0; (i < lastIndex); i++) {
    o = o[elements[i]];
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

