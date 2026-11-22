package com.drone3d.app

import android.app.Application
import android.content.Context

class Drone3DApplication : Application() {
    override fun attachBaseContext(base: Context?) {
        super.attachBaseContext(base)
        // Mandatory for DJI Mobile SDK v5: must run before any SDK class is touched.
        com.cySdkyc.clx.Helper.install(this)
    }
}
