document.addEventListener('DOMContentLoaded', function() {
  var el = document.getElementById('currentYear');
  if (el) el.textContent = new Date().getFullYear();
});