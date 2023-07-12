(function() {
    let fakeProcess = {};
    fakeProcess.process = fakeProcess;

    fakeProcess.cwd = function() {
        return "/www";
    };

    fakeProcess.mainModule = {
        filename: "/www/index.html"
    };
    fakeProcess.env = {
        LOCALAPPDATA: "/appdata"
    };

    window.process = fakeProcess;



    window.nw = {
        App: {
            argv: ""
        }
    };

    window.Buffer = buffer.Buffer;
    window.global = window;
})();