//
//  OpenClawAppApp.swift
//  OpenClawApp
//
//  Created by Harro Krog on 31.01.26.
//

import SwiftUI

@main
struct OpenClawAppApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.chatManager, ChatManager())
                .environment(\.integrationsManager, IntegrationsManager())
        }
    }
}
