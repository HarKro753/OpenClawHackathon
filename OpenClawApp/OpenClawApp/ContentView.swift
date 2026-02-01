//
//  ContentView.swift
//  OpenClawApp
//
//  Created by Harro Krog on 31.01.26.
//

import SwiftUI

enum OnboardingStep {
    case getStarted
    case integrations
    case chat
}

struct ContentView: View {
    @State private var currentStep: OnboardingStep = .getStarted
    
    var body: some View {
        switch currentStep {
        case .getStarted:
            GetStartedView {
                withAnimation {
                    currentStep = .integrations
                }
            }
        case .integrations:
            IntegrationsView {
                withAnimation {
                    currentStep = .chat
                }
            }
        case .chat:
            ChatView()
        }
    }
}

#Preview {
    ContentView()
        .environment(\.chatManager, ChatManager())
        .environment(\.integrationsManager, IntegrationsManager())
}
