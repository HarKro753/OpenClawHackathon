//
//  GetStartedView.swift
//  OpenClawApp
//

import SwiftUI

struct GetStartedView: View {
    let onGetStarted: () -> Void
    
    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            
            // Logo/Icon area
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 64))
                .foregroundStyle(.primary)
                .padding(.bottom, 24)
            
            // Title
            Text("OpenClaw")
                .font(.largeTitle)
                .fontWeight(.bold)
                .padding(.bottom, 8)
            
            // Subtitle
            Text("Your AI assistant")
                .font(.title3)
                .foregroundStyle(.secondary)
            
            Spacer()
            
            // Get Started button at bottom (matching IntegrationsView)
            VStack(spacing: 0) {
                Divider()
                Button(action: onGetStarted) {
                    Text("Get Started")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(.label))
                        )
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
            }
            .background(Color(.systemBackground))
        }
        .background(Color(.systemGroupedBackground))
    }
}

#Preview {
    GetStartedView(onGetStarted: {})
}
