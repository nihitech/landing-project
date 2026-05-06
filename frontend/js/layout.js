fetch("./components/sidebar.html")
    .then(res => res.text())
    .then(data => {
        document.getElementById("sidebarContainer").innerHTML = data;
    });

function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    window.location.href = "login.html";
}