    # Insert before `location /` in the plainlist.space HTTPS server.
    # /download is the only user-facing download page. Artifacts are
    # versioned files under /downloads/; latest.json is short-cache metadata.
    location = /download {
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
        try_files /download/index.html =404;
    }
    location = /download/ {
        return 308 /download;
    }
    location = /releases/latest.json {
        alias /www/wwwroot/plainlist-downloads/latest.json;
        default_type application/json;
        add_header Cache-Control "public, max-age=60, must-revalidate";
    }
    location ^~ /downloads/ {
        alias /www/wwwroot/plainlist-downloads/;
        autoindex off;
        add_header Cache-Control "public, max-age=31536000, immutable";
        types {
            application/octet-stream dmg;
            application/vnd.android.package-archive apk;
            text/plain txt;
            application/json json;
        }
    }
