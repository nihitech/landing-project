
fetch("./components/sidebar.html")
.then(r => r.text())
.then(html => {
 const box = document.getElementById("sidebarContainer");
 if(box) box.innerHTML = html;
});

function logout(){
 sessionStorage.clear();
 location.href='login.html';
}
