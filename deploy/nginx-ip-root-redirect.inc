    # The IP vhost still serves /api, /widget/*, /guide.html, and legacy
    # /downloads/*. Only the old product download page at / is retired.
    location = / {
        return 308 https://plainlist.space/download;
    }
    location = /index.html {
        return 308 https://plainlist.space/download;
    }
