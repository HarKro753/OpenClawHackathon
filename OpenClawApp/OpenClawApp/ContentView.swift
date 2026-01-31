//
//  ContentView.swift
//  OpenClawApp
//
//  Created by Harro Krog on 31.01.26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        ChatView()
    }
}

#Preview {
    ContentView()
        .environment(\.chatManager, ChatManager())
        .environment(\.integrationsManager, IntegrationsManager())
}
