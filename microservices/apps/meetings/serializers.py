from rest_framework import serializers
from .models import ParticipantState

class ParticipantStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParticipantState
        fields = "__all__"