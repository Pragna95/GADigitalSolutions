from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0005_alter_participantstate_meeting_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='recording',
            name='meeting_session',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='recordings',
                to='meetings.meetingsession'
            ),
        ),
    ]
