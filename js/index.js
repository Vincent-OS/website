function hamburger() {
  var x = document.getElementById("top");
  if (x.className === "top") {
    x.className += " responsive";
  } else {
    x.className = "top";
  }
}