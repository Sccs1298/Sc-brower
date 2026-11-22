package com.drone3d.avata

import android.app.Application
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform

class AvataApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (!Python.isStarted()) Python.start(AndroidPlatform(this))
        Engine.start(this)
    }
}
