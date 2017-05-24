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
  } else {
    delete o[last];
  }
};

