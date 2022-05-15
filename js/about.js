function myFunction() {
    var x = document.getElementById("myTop");
    if (x.className === "top") {
      x.className += " responsive";
    } else {
      x.className = "top";
    }
  }